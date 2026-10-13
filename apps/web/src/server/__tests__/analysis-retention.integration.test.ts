/**
 * The retention purge deletes data, so every boundary is pinned here. Fixtures
 * sit around 2020-01-01, years before any other test's runs, because the purge
 * walks every brand in the database.
 */
import { db } from "@workspace/lib/db/db";
import {
	promptRuns,
	runMentionAnalyses,
	runSubjectMentions,
	runTexts,
	stanceJudgements,
} from "@workspace/lib/db/schema";
import { reconcileRunAnalyses } from "@workspace/lib/enrichment/reconcile";
import { purgeExpiredAnalysis } from "@workspace/lib/enrichment/retention";
import { SENTIMENT_ANALYZER_VERSION } from "@workspace/lib/enrichment/sentiment";
import { insertRunText } from "@workspace/lib/run-texts";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBrandMentionProminence } from "@/server/analytics-core";
import { createBrand, createCompetitor, createPrompt, createRun, deleteBrand } from "@/test/integration/stats-fixtures";

const DAY = 86_400_000;
const HORIZON = new Date("2020-01-01T00:00:00Z");
const ANSWER = "Acme leads, Globex follows.";

let brandId: string;
let before: string;
let atHorizon: string;
let after: string;
const brandIds: string[] = [];

async function seed() {
	brandId = await createBrand({ name: "Acme" });
	brandIds.push(brandId);
	await createCompetitor(brandId, "Globex");
	const promptId = await createPrompt(brandId);
	const run = async (at: Date) => {
		const { id } = await createRun(brandId, promptId, { at: at.toISOString(), brandMentioned: true });
		await insertRunText(db, id, ANSWER);
		return id;
	};
	before = await run(new Date(HORIZON.getTime() - DAY));
	atHorizon = await run(HORIZON);
	after = await run(new Date(HORIZON.getTime() + DAY));
	await reconcileRunAnalyses({ brandId, batchSize: 50, pauseMs: 0, dryRun: false });
}

async function analysed(runId: string) {
	const markers = await db.select().from(runMentionAnalyses).where(eq(runMentionAnalyses.promptRunId, runId));
	const mentions = await db.select().from(runSubjectMentions).where(eq(runSubjectMentions.promptRunId, runId));
	return { marker: markers.length, mentions: mentions.length };
}

/** Retention whose horizon falls between `before` and `atHorizon`, counted back from now. */
function retainSinceHorizon() {
	vi.stubEnv("ENRICHMENT_RETENTION_DAYS", String(Math.ceil((Date.now() - HORIZON.getTime()) / DAY)));
}

beforeEach(async () => {
	vi.stubEnv("DEPLOYMENT_MODE", "local");
	await seed();
});

afterEach(() => {
	vi.unstubAllEnvs();
});

afterAll(async () => {
	const hashes = (
		await db
			.select({ hash: runTexts.contentHash })
			.from(runTexts)
			.innerJoin(promptRuns, eq(promptRuns.id, runTexts.promptRunId))
			.where(inArray(promptRuns.brandId, brandIds))
	).flatMap((row) => (row.hash ? [row.hash] : []));
	if (hashes.length > 0) await db.delete(stanceJudgements).where(inArray(stanceJudgements.contentHash, hashes));
	for (const id of brandIds) await deleteBrand(id);
});

describe("purgeExpiredAnalysis", () => {
	it("deletes the analysis of runs before the horizon and nothing at or after it", async () => {
		expect(await analysed(before)).toEqual({ marker: 1, mentions: 2 });
		await purgeExpiredAnalysis({ horizon: HORIZON, batchSize: 1, dryRun: false });
		expect(await analysed(before)).toEqual({ marker: 0, mentions: 0 });
		expect(await analysed(atHorizon)).toEqual({ marker: 1, mentions: 2 });
		expect(await analysed(after)).toEqual({ marker: 1, mentions: 2 });
	});

	it("keeps the run, its text and its paid judgements", async () => {
		const [text] = await db.select().from(runTexts).where(eq(runTexts.promptRunId, before));
		await db.insert(stanceJudgements).values({
			contentHash: text.contentHash!,
			subjectName: `Acme ${brandId}`,
			analyzerVersion: SENTIMENT_ANALYZER_VERSION,
			analyzerModel: "test",
			status: "done",
			stance: "recommended",
		});
		await purgeExpiredAnalysis({ horizon: HORIZON, batchSize: 100, dryRun: false });
		expect(await db.select().from(promptRuns).where(eq(promptRuns.id, before))).toHaveLength(1);
		expect(await db.select().from(runTexts).where(eq(runTexts.promptRunId, before))).toHaveLength(1);
		const judgements = await db
			.select()
			.from(stanceJudgements)
			.where(eq(stanceJudgements.subjectName, `Acme ${brandId}`));
		expect(judgements).toHaveLength(1);
	});

	it("counts what it would purge on a dry run and deletes nothing", async () => {
		const { runs } = await purgeExpiredAnalysis({ horizon: HORIZON, batchSize: 100, dryRun: true });
		expect(runs).toBeGreaterThanOrEqual(1);
		expect(await analysed(before)).toEqual({ marker: 1, mentions: 2 });
	});

	it("isn't undone by the reconciler, which still rebuilds stale runs inside the horizon", async () => {
		await purgeExpiredAnalysis({ horizon: HORIZON, batchSize: 100, dryRun: false });
		await db.delete(runMentionAnalyses).where(eq(runMentionAnalyses.promptRunId, after));
		retainSinceHorizon();
		await reconcileRunAnalyses({ brandId, batchSize: 50, pauseMs: 0, dryRun: false });
		expect(await analysed(before)).toEqual({ marker: 0, mentions: 0 });
		expect((await analysed(after)).marker).toBe(1);
	});

	it("leaves purged runs out of the mention read, which says where retained analysis starts", async () => {
		await purgeExpiredAnalysis({ horizon: HORIZON, batchSize: 100, dryRun: false });
		retainSinceHorizon();
		const window = { from: "2019-12-01T00:00:00Z", to: "2020-02-01T00:00:00Z", timezone: "UTC" };
		const { coverage } = await getBrandMentionProminence(brandId, window);
		expect(coverage.runs).toBe(2);
		expect(coverage.analysed).toBe(2);
		expect(new Date(coverage.retainedFrom!).getTime()).toBeLessThanOrEqual(HORIZON.getTime());
		expect(new Date(coverage.retainedFrom!).getTime()).toBeGreaterThan(HORIZON.getTime() - DAY);
	});
});
