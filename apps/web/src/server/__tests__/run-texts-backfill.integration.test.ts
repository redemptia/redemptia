import { createHash } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { runTexts } from "@workspace/lib/db/schema";
import { backfillRunTexts } from "@workspace/lib/run-texts";
import { TEXT_EXTRACTOR_VERSION } from "@workspace/lib/text-extraction";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBrand, createPrompt, createRun, deleteBrand } from "@/test/integration/stats-fixtures";

// Other test files share this database and the backfill walks every run in it,
// so these assert on the rows of their own runs, never on global counts.

const ANSWER = "Acme and Globex both make good anvils.";
const answered = { choices: [{ message: { content: ANSWER } }] };

let brandId: string;
let promptId: string;

async function run(rawOutput: unknown, provider = "openrouter") {
	const { id } = await createRun(brandId, promptId, {
		at: "2026-09-01T12:00:00Z",
		brandMentioned: false,
		provider,
		rawOutput,
	});
	return id;
}

async function textRow(runId: string) {
	return db.query.runTexts.findFirst({ where: eq(runTexts.promptRunId, runId) });
}

// Small batches, so the backfill crosses batch boundaries even on a quiet database.
const backfill = (dryRun = false) => backfillRunTexts({ batchSize: 2, pauseMs: 0, dryRun });

beforeAll(async () => {
	brandId = await createBrand();
	promptId = await createPrompt(brandId);
});

afterAll(async () => {
	await deleteBrand(brandId);
});

describe("backfilling run texts", () => {
	it("writes nothing on a dry run", async () => {
		const runId = await run(answered);

		const progress = await backfill(true);

		expect(progress.remaining).toBeGreaterThanOrEqual(1);
		expect(await textRow(runId)).toBeUndefined();
	});

	it("gives a run with an answer its text, hash and length", async () => {
		const runId = await run(answered);

		await backfill();

		expect(await textRow(runId)).toMatchObject({
			text: ANSWER,
			contentHash: createHash("sha256").update(ANSWER).digest("hex"),
			answerLength: ANSWER.length,
			extractorVersion: TEXT_EXTRACTOR_VERSION,
		});
	});

	it("gives a run with no answer a row with no text", async () => {
		const runId = await run({}, "brightdata");

		await backfill();

		expect(await textRow(runId)).toMatchObject({
			text: null,
			contentHash: null,
			answerLength: null,
			extractorVersion: TEXT_EXTRACTOR_VERSION,
		});
	});

	it("leaves a run that already has a current row alone", async () => {
		const runId = await run(answered);
		await db.insert(runTexts).values({ promptRunId: runId, text: "kept", extractorVersion: TEXT_EXTRACTOR_VERSION });

		await backfill();

		expect(await textRow(runId)).toMatchObject({ text: "kept", extractorVersion: TEXT_EXTRACTOR_VERSION });
	});

	it("re-extracts a row written by an older extractor", async () => {
		const runId = await run(answered);
		await db
			.insert(runTexts)
			.values({ promptRunId: runId, text: "stale", extractorVersion: TEXT_EXTRACTOR_VERSION - 1 });

		await backfill();

		expect(await textRow(runId)).toMatchObject({ text: ANSWER, extractorVersion: TEXT_EXTRACTOR_VERSION });
	});

	it("leaves every run with a current row", async () => {
		const runIds = [await run(answered), await run({}, "oxylabs"), await run(answered)];

		await backfill();

		for (const runId of runIds) {
			expect((await textRow(runId))?.extractorVersion).toBe(TEXT_EXTRACTOR_VERSION);
		}
	});
});
