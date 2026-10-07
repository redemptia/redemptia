import { createHash } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { runTexts } from "@workspace/lib/db/schema";
import { insertRunText } from "@workspace/lib/run-texts";
import { TEXT_EXTRACTOR_VERSION } from "@workspace/lib/text-extraction";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createBrand, createPrompt, createRun, deleteBrand } from "@/test/integration/stats-fixtures";

// Deleting a prompt also unschedules its job; that's pg-boss's business, not this test's.
vi.mock("@/lib/job-scheduler", () => ({ removePromptJobScheduler: async () => true }));

const { deletePrompt } = await import("@/server/prompts-core");

const brandIds: string[] = [];

async function run() {
	const brandId = await createBrand();
	brandIds.push(brandId);
	const promptId = await createPrompt(brandId);
	const { id } = await createRun(brandId, promptId, { at: "2026-10-01T12:00:00Z", brandMentioned: false });
	return { promptId, runId: id };
}

async function textRow(runId: string) {
	return db.query.runTexts.findFirst({ where: eq(runTexts.promptRunId, runId) });
}

afterAll(async () => {
	for (const id of brandIds) await deleteBrand(id);
});

describe("run texts", () => {
	it("stores a run's answer with its hash and length", async () => {
		const { runId } = await run();
		const answer = "Acme and Globex both make good anvils.";

		await insertRunText(db, runId, answer);

		expect(await textRow(runId)).toMatchObject({
			text: answer,
			contentHash: createHash("sha256").update(answer).digest("hex"),
			answerLength: answer.length,
			extractorVersion: TEXT_EXTRACTOR_VERSION,
			source: "live",
		});
	});

	it("stores a run whose extractor found no answer with no text, so it is never scored", async () => {
		const { runId } = await run();

		await insertRunText(db, runId, "No text content found in OpenAI output.");

		expect(await textRow(runId)).toMatchObject({
			text: null,
			contentHash: null,
			answerLength: null,
			extractorVersion: TEXT_EXTRACTOR_VERSION,
		});
	});

	it("goes when its prompt is deleted", async () => {
		const { promptId, runId } = await run();
		await insertRunText(db, runId, "An answer.");

		await deletePrompt(promptId);

		const left = await db
			.select()
			.from(runTexts)
			.where(inArray(runTexts.promptRunId, [runId]));
		expect(left).toEqual([]);
	});
});
