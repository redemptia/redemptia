import { randomUUID } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { runMentionAnalyses, runSubjectMentions, stanceJudgements, usageEvents } from "@workspace/lib/db/schema";
import { reconcileRunAnalyses } from "@workspace/lib/enrichment/reconcile";
import { analyzeSentimentBatch, type Classifier } from "@workspace/lib/enrichment/sentiment";
import { insertRunText } from "@workspace/lib/run-texts";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createBrand, createCompetitor, createPrompt, createRun, deleteBrand } from "@/test/integration/stats-fixtures";

const DAY = "2026-10-01";
const brandIds: string[] = [];
// Judgements are cached by answer text across every brand, so each test gets
// answers of its own: a fresh suffix keeps their content hashes unique.
let SHARED = "";
let OTHER = "";
beforeEach(() => {
	const nonce = randomUUID();
	SHARED = `Acme is the clear pick for most teams this year, while Globex is capable but expensive for small budgets. (${nonce})`;
	OTHER = `Globex works well for enterprises that need deep integrations and dedicated support from a vendor. (${nonce})`;
});

/** A fake model: records what it was sent, answers every subject, bills a fixed cost per call. */
function fakeClassifier(costUsd = 0.01) {
	const sent: { answer: string | null; subjects: string[] }[] = [];
	const classify: Classifier = async (answer, subjects) => {
		sent.push({ answer, subjects: [...subjects] });
		const evidence = answer.split(/\s+/).slice(0, 12).join(" ");
		return {
			judgements: subjects.map((subject) => ({
				subject,
				stance: "recommended" as const,
				role: "primary_pick" as const,
				confidence: 0.9,
				evidence,
			})),
			usage: { inputTokens: 1000, outputTokens: 100, costUsd },
			model: "google/gemini-2.5-flash",
		};
	};
	return { classify, sent };
}

async function brandWithAnswers(answers: string[]) {
	const brandId = await createBrand({ name: "Acme" });
	brandIds.push(brandId);
	await createCompetitor(brandId, "Globex");
	const promptId = await createPrompt(brandId);
	for (const [i, answer] of answers.entries()) {
		const run = await createRun(brandId, promptId, { at: `${DAY}T12:00:0${i}Z`, brandMentioned: false });
		await insertRunText(db, run.id, answer);
	}
	await reconcileRunAnalyses({ brandId, batchSize: 50, pauseMs: 0, dryRun: false });
	return { brandId, promptId, batch: { promptId, model: "chatgpt", day: DAY } };
}

const judge = (batch: { promptId: string; model: string; day: string }, classify: Classifier, capUsd = 2) =>
	analyzeSentimentBatch(batch, { classify, capUsd, model: "google/gemini-2.5-flash" });

async function judgementsFor(hashes: string[]) {
	if (hashes.length === 0) return [];
	return db
		.select({ subject: stanceJudgements.subjectName, status: stanceJudgements.status, stance: stanceJudgements.stance })
		.from(stanceJudgements)
		.where(
			sql`${stanceJudgements.contentHash} IN (${sql.join(
				hashes.map((h) => sql`${h}`),
				sql`, `,
			)})`,
		);
}

async function hashesOf(brandId: string) {
	const { rows } = await db.execute<{ content_hash: string }>(sql`
		SELECT DISTINCT rt.content_hash FROM run_texts rt JOIN prompt_runs pr ON pr.id = rt.prompt_run_id
		WHERE pr.brand_id = ${brandId} AND rt.content_hash IS NOT NULL`);
	return rows.map((r) => r.content_hash);
}

afterAll(async () => {
	for (const id of brandIds) {
		await db.delete(stanceJudgements).where(sql`${stanceJudgements.contentHash} IN (
			SELECT rt.content_hash FROM run_texts rt JOIN prompt_runs pr ON pr.id = rt.prompt_run_id WHERE pr.brand_id = ${id})`);
		await db.delete(usageEvents).where(eq(usageEvents.organizationId, id));
		await deleteBrand(id);
	}
});

describe("analyzeSentimentBatch", () => {
	it("makes one paid call per distinct answer, so replications share a judgement", async () => {
		const { brandId, batch } = await brandWithAnswers([SHARED, SHARED, OTHER]);
		const fake = fakeClassifier();
		expect(await judge(batch, fake.classify)).toMatchObject({ calls: 2, cached: 0, stoppedAtCeiling: false });

		const rows = await judgementsFor(await hashesOf(brandId));
		expect(rows.filter((r) => r.status === "done")).toHaveLength(3);
	});

	it("never pays twice for a judgement already made", async () => {
		const { batch } = await brandWithAnswers([SHARED, OTHER]);
		await judge(batch, fakeClassifier().classify);

		const again = fakeClassifier();
		expect(await judge(batch, again.classify)).toMatchObject({ calls: 0, cached: 2 });
		expect(again.sent).toHaveLength(0);
	});

	it("lets two concurrent batches over the same answers make each paid call once", async () => {
		const { batch } = await brandWithAnswers([SHARED, OTHER]);
		const first = fakeClassifier();
		const second = fakeClassifier();
		await Promise.all([judge(batch, first.classify), judge(batch, second.classify)]);
		expect(first.sent.length + second.sent.length).toBe(2);
	});

	it("never sends a run with no answer text to the model", async () => {
		const { brandId, promptId, batch } = await brandWithAnswers([SHARED]);
		// A NULL-text run, given a current marker and a mention row by hand, so only
		// the text filter stands between it and the model.
		const run = await createRun(brandId, promptId, { at: `${DAY}T13:00:00Z`, brandMentioned: true });
		await insertRunText(db, run.id, "");
		const [marker] = await db
			.select()
			.from(runMentionAnalyses)
			.limit(1)
			.where(sql`${runMentionAnalyses.promptRunId} IN (SELECT id FROM prompt_runs WHERE brand_id = ${brandId})`);
		await db
			.insert(runMentionAnalyses)
			.values({ ...marker, promptRunId: run.id })
			.onConflictDoNothing();
		await db.insert(runSubjectMentions).values({
			promptRunId: run.id,
			subjectKey: brandId,
			subjectKind: "brand",
			subjectName: "Acme",
			promptId,
			model: "chatgpt",
			createdAt: new Date(`${DAY}T13:00:00Z`),
			firstOffset: 0,
			position: 0,
		});

		const fake = fakeClassifier();
		await judge(batch, fake.classify);
		expect(fake.sent.every((call) => typeof call.answer === "string" && call.answer.length > 0)).toBe(true);
		expect(fake.sent).toHaveLength(1);
	});

	it("stops at the org's enrichment ceiling, before the call that would exceed it", async () => {
		const { batch } = await brandWithAnswers([SHARED, OTHER]);
		const fake = fakeClassifier(0.5);
		expect(await judge(batch, fake.classify, 0.5)).toMatchObject({ calls: 1, stoppedAtCeiling: true });
		expect(fake.sent).toHaveLength(1);
	});

	it("makes no call at all for an org already at its ceiling", async () => {
		const { brandId, batch } = await brandWithAnswers([SHARED]);
		await db.insert(usageEvents).values({
			organizationId: brandId,
			brandId,
			eventType: "sentiment-analysis",
			estimatedCostUsd: "2.000000",
		});
		const fake = fakeClassifier();
		expect(await judge(batch, fake.classify)).toMatchObject({ calls: 0, stoppedAtCeiling: true });
	});

	it("records each paid call's billed cost and tokens in the same transaction as its judgements", async () => {
		const { brandId, batch } = await brandWithAnswers([OTHER]);
		await judge(batch, fakeClassifier(0.0123).classify);
		const rows = await db.select().from(usageEvents).where(eq(usageEvents.organizationId, brandId));
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ eventType: "sentiment-analysis", inputTokens: 1000, outputTokens: 100 });
		expect(Number(rows[0].estimatedCostUsd)).toBeCloseTo(0.0123, 6);
	});

	it("frees a failed call's claims, so a retry judges them", async () => {
		const { batch } = await brandWithAnswers([OTHER]);
		const failing: Classifier = async () => {
			throw new Error("provider down");
		};
		await expect(judge(batch, failing)).rejects.toThrow("provider down");
		const retry = fakeClassifier();
		expect(await judge(batch, retry.classify)).toMatchObject({ calls: 1 });
	});
});
