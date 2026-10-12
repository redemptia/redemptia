import { db } from "@workspace/lib/db/db";
import { runMentionAnalyses } from "@workspace/lib/db/schema";
import { rankSubjects } from "@workspace/lib/enrichment";
import { reconcileRunAnalyses } from "@workspace/lib/enrichment/reconcile";
import { loadBrandSubjects } from "@workspace/lib/enrichment/write";
import { locateSubject } from "@workspace/lib/mentions";
import { insertRunText } from "@workspace/lib/run-texts";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getBrandMentionProminence } from "@/server/analytics-core";
import { createBrand, createCompetitor, createPrompt, createRun, deleteBrand } from "@/test/integration/stats-fixtures";

const WINDOW = { from: "2026-10-01T00:00:00Z", to: "2026-10-02T00:00:00Z", timezone: "UTC" };
// Analysed: the first three. The last three are left not analysed, each in a
// different way, and name only Initech, so counting any of them would show.
const ANALYSED = ["Globex leads, then Acme.", "Acme alone.", "Acme Labs and Acme, together."];
const NOT_ANALYSED = ["Initech, Initech.", "Initech wins.", "Initech again."];

let brandId: string;
let runIds: string[];

beforeAll(async () => {
	brandId = await createBrand({ name: "Acme" });
	await createCompetitor(brandId, "Globex");
	await createCompetitor(brandId, "Initech");
	await createCompetitor(brandId, "Acme Labs");
	const promptId = await createPrompt(brandId);
	runIds = [];
	for (const [i, text] of [...ANALYSED, ...NOT_ANALYSED].entries()) {
		const run = await createRun(brandId, promptId, { at: `2026-10-01T12:00:0${i}Z`, brandMentioned: false });
		await insertRunText(db, run.id, text);
		runIds.push(run.id);
	}
	await reconcileRunAnalyses({ brandId, batchSize: 50, pauseMs: 0, dryRun: false });

	const [stale, missing, otherSubjects] = runIds.slice(3);
	await db.update(runMentionAnalyses).set({ analyzerVersion: 0 }).where(eq(runMentionAnalyses.promptRunId, stale));
	await db.delete(runMentionAnalyses).where(eq(runMentionAnalyses.promptRunId, missing));
	await db
		.update(runMentionAnalyses)
		.set({ subjectFingerprint: "older-subject-set" })
		.where(eq(runMentionAnalyses.promptRunId, otherSubjects));
});

afterAll(async () => {
	await deleteBrand(brandId);
});

describe("getBrandMentionProminence", () => {
	it("counts every run in coverage but only current analyses as analysed", async () => {
		const { coverage } = await getBrandMentionProminence(brandId, WINDOW);
		expect(coverage).toEqual({ runs: 6, analysed: 3 });
	});

	it("reads mentions only from analysed runs, so a subject named only in the rest shows none", async () => {
		const { subjects } = await getBrandMentionProminence(brandId, WINDOW);
		expect(subjects.find((s) => s.name === "Initech")).toMatchObject({
			mentionedRuns: 0,
			mentionRate: 0,
			averageProminence: null,
			averageRank: null,
		});
	});

	it("lists the brand first and rates each subject over the analysed runs", async () => {
		const { subjects } = await getBrandMentionProminence(brandId, WINDOW);
		expect(subjects.map((s) => [s.name, s.mentionedRuns, s.mentionRate])).toEqual([
			["Acme", 3, 1],
			["Acme Labs", 1, 1 / 3],
			["Globex", 1, 1 / 3],
			["Initech", 0, 0],
		]);
	});

	it("scores prominence from where each subject first appears", async () => {
		const { subjects } = await getBrandMentionProminence(brandId, WINDOW);
		const acme = subjects.find((s) => s.name === "Acme");
		const offsets = ANALYSED.map((text) => {
			const lower = text.toLowerCase();
			return (lower.indexOf("acme") as number) / lower.length;
		});
		expect(acme?.averageProminence).toBeCloseTo(1 - offsets.reduce((a, b) => a + b, 0) / offsets.length, 10);
		expect(subjects.find((s) => s.name === "Globex")?.averageProminence).toBe(1);
	});

	it("ranks exactly as rankSubjects does, ties included", async () => {
		const stored = await loadBrandSubjects(db, brandId);
		const totals = new Map<string, number[]>();
		for (const text of ANALYSED) {
			const lower = text.toLowerCase();
			const ranks = rankSubjects(
				(stored ?? []).map((subject) => ({ key: subject.key, first: locateSubject(lower, subject)?.first ?? null })),
			);
			for (const [key, rank] of ranks) totals.set(key, [...(totals.get(key) ?? []), rank]);
		}

		const { subjects } = await getBrandMentionProminence(brandId, WINDOW);
		for (const subject of subjects) {
			const ranks = totals.get(subject.key);
			expect(subject.averageRank).toBe(ranks ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null);
		}
		// The third answer opens with "Acme Labs", which also starts with "Acme": a tie at rank 1.
		expect(subjects.find((s) => s.name === "Acme Labs")?.averageRank).toBe(1);
	});

	it("reports nothing analysed, rather than zero mentions, when no run is", async () => {
		const empty = await createBrand({ name: "Empty" });
		const promptId = await createPrompt(empty);
		await createRun(empty, promptId, { at: "2026-10-01T12:00:00Z", brandMentioned: true });
		try {
			const { coverage, subjects } = await getBrandMentionProminence(empty, WINDOW);
			expect(coverage).toEqual({ runs: 1, analysed: 0 });
			expect(subjects[0]).toMatchObject({ mentionedRuns: 0, mentionRate: null });
		} finally {
			await deleteBrand(empty);
		}
	});
});
