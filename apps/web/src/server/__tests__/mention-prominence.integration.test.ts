import { db } from "@workspace/lib/db/db";
import { runMentionAnalyses, runTexts } from "@workspace/lib/db/schema";
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
// Analysed: the first three. The rest are left not analysed, each in a
// different way, and name only Initech, so counting any of them would show.
// The third opens with a tie ("Acme Labs" starts with "Acme"), then Globex, which
// must rank 3 rather than 2.
const ANALYSED = ["Globex leads, then Acme.", "Acme alone.", "Acme Labs and Acme, then Globex."];
const NOT_ANALYSED = ["Initech, Initech.", "Initech wins.", "Initech again.", "Initech, re-extracted."];

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

	const [stale, missing, otherSubjects, reextracted] = runIds.slice(3);
	await db.update(runTexts).set({ extractorVersion: 99 }).where(eq(runTexts.promptRunId, reextracted));
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
		expect(coverage).toEqual({ runs: 7, analysed: 3 });
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
			["Globex", 2, 2 / 3],
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
		expect(subjects.find((s) => s.name === "Acme Labs")?.averageProminence).toBe(1);
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
		// Globex: rank 1 in the first answer, and 3 (not 2) after the tie in the third.
		expect(subjects.find((s) => s.name === "Globex")?.averageRank).toBe(2);
	});

	it("narrows coverage and counts to the filtered model", async () => {
		const { coverage, subjects } = await getBrandMentionProminence(brandId, WINDOW, { model: "claude" });
		expect(coverage).toEqual({ runs: 0, analysed: 0 });
		expect(subjects.every((s) => s.mentionedRuns === 0)).toBe(true);
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
