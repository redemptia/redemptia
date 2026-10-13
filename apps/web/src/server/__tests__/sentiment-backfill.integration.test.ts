import { randomUUID } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { stanceJudgements, usageEvents } from "@workspace/lib/db/schema";
import { reconcileRunAnalyses } from "@workspace/lib/enrichment/reconcile";
import { backfillSentiment, type Classifier } from "@workspace/lib/enrichment/sentiment";
import { insertRunText } from "@workspace/lib/run-texts";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createBrand, createCompetitor, createPrompt, createRun, deleteBrand } from "@/test/integration/stats-fixtures";

const DAY = "2026-10-01";
const brandIds: string[] = [];

/** Counts every call and bills each one, so a dry run that leaked through would show. */
function countingClassifier() {
	const sent: string[] = [];
	const classify: Classifier = async (answer, subjects) => {
		sent.push(answer);
		return {
			judgements: subjects.map((subject) => ({
				subject,
				stance: "mentioned_neutral" as const,
				role: "alternative" as const,
				confidence: 0.8,
				evidence: "",
			})),
			usage: { inputTokens: 300, outputTokens: 150, costUsd: 0.001 },
			model: "gemini-3.5-flash-lite",
		};
	};
	return { classify, sent };
}

/** Three runs over two distinct answers, each mentioning both subjects. */
async function brandWithRuns() {
	const nonce = randomUUID();
	const brandId = await createBrand({ name: "Acme" });
	brandIds.push(brandId);
	await createCompetitor(brandId, "Globex");
	const promptId = await createPrompt(brandId);
	const answers = [
		`Acme is the pick for small teams, and Globex suits enterprises. (${nonce})`,
		`Acme is the pick for small teams, and Globex suits enterprises. (${nonce})`,
		`Globex and Acme both offer free tiers for new customers. (${nonce})`,
	];
	for (const [i, answer] of answers.entries()) {
		const run = await createRun(brandId, promptId, { at: `${DAY}T12:00:0${i}Z`, brandMentioned: true });
		await insertRunText(db, run.id, answer);
	}
	await reconcileRunAnalyses({ brandId, batchSize: 50, pauseMs: 0, dryRun: false });
	return brandId;
}

async function writesFor(brandId: string) {
	const usage = await db.select().from(usageEvents).where(eq(usageEvents.organizationId, brandId));
	const { rows } = await db.execute(sql`
		SELECT 1 FROM stance_judgements j
		WHERE j.content_hash IN (
			SELECT rt.content_hash FROM run_texts rt JOIN prompt_runs pr ON pr.id = rt.prompt_run_id WHERE pr.brand_id = ${brandId})`);
	return { usage: usage.length, judgements: rows.length };
}

const backfill = (brandId: string, classify: Classifier, dryRun: boolean) =>
	backfillSentiment({
		days: 60,
		brandId,
		dryRun,
		classify,
		capUsd: 2,
		model: "gemini-3.5-flash-lite",
		costPerCallUsd: 0.0005,
	});

afterAll(async () => {
	for (const id of brandIds) {
		await db.delete(stanceJudgements).where(sql`${stanceJudgements.contentHash} IN (
			SELECT rt.content_hash FROM run_texts rt JOIN prompt_runs pr ON pr.id = rt.prompt_run_id WHERE pr.brand_id = ${id})`);
		await db.delete(usageEvents).where(eq(usageEvents.organizationId, id));
		await deleteBrand(id);
	}
});

describe("backfillSentiment", () => {
	it("on a dry run counts the paid calls and their cost, but calls no model and writes nothing", async () => {
		const brandId = await brandWithRuns();
		const fake = countingClassifier();
		const result = await backfill(brandId, fake.classify, true);

		expect(fake.sent).toHaveLength(0);
		expect(await writesFor(brandId)).toEqual({ usage: 0, judgements: 0 });
		expect(result).toMatchObject({ batches: 1, callsNeeded: 2, callsMade: 0 });
		expect(result.estimatedCostUsd).toBeCloseTo(0.001, 6);
	});

	it("for real makes the counted calls, after which nothing is left to judge", async () => {
		const brandId = await brandWithRuns();
		const fake = countingClassifier();
		expect(await backfill(brandId, fake.classify, false)).toMatchObject({ callsMade: 2 });
		expect(fake.sent).toHaveLength(2);
		expect((await writesFor(brandId)).usage).toBe(2);

		expect(await backfill(brandId, countingClassifier().classify, true)).toMatchObject({ callsNeeded: 0 });
	});
});
