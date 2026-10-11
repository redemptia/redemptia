import { db } from "@workspace/lib/db/db";
import { promptRuns, runMentionAnalyses, runSubjectMentions, runTexts } from "@workspace/lib/db/schema";
import { ANALYZER_VERSION, type AnalysisSubject, brandSubjects, subjectFingerprint } from "@workspace/lib/enrichment";
import { tryWriteRunAnalysis, writeRunAnalysis } from "@workspace/lib/enrichment/write";
import { insertRunText } from "@workspace/lib/run-texts";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createBrand, createPrompt, createRun, deleteBrand } from "@/test/integration/stats-fixtures";

const brandIds: string[] = [];

async function freshRun() {
	const brandId = await createBrand();
	brandIds.push(brandId);
	const promptId = await createPrompt(brandId);
	const run = await createRun(brandId, promptId, { at: "2026-10-01T12:00:00Z", brandMentioned: false });
	return { brandId, promptId, run };
}

const subjectsFor = (brandId: string, competitors = [{ id: "c-1", name: "Globex", aliases: [], domains: [] }]) =>
	brandSubjects(
		{ id: brandId, name: "Acme", website: "https://acme.example", aliases: [], additionalDomains: [] },
		competitors,
	);

async function stored(runId: string) {
	const [marker] = await db.select().from(runMentionAnalyses).where(eq(runMentionAnalyses.promptRunId, runId));
	const mentions = await db
		.select({ key: runSubjectMentions.subjectKey, first: runSubjectMentions.firstOffset })
		.from(runSubjectMentions)
		.where(eq(runSubjectMentions.promptRunId, runId))
		.orderBy(runSubjectMentions.subjectKey);
	return { marker, mentions };
}

afterAll(async () => {
	for (const id of brandIds) await deleteBrand(id);
});

describe("writeRunAnalysis", () => {
	it("stores a row per mentioned subject and a marker recording what it was computed from", async () => {
		const { brandId, run } = await freshRun();
		const subjects = subjectsFor(brandId);
		await db.transaction((tx) => writeRunAnalysis(tx, run, "Globex, then Acme.", 7, subjects));

		const { marker, mentions } = await stored(run.id);
		expect(mentions).toEqual([
			{ key: brandId, first: 13 },
			{ key: "c-1", first: 0 },
		]);
		expect(marker).toMatchObject({
			analyzerVersion: ANALYZER_VERSION,
			extractorVersion: 7,
			subjectFingerprint: subjectFingerprint(subjects),
		});
	});

	it("marks a run with no answer text as analysed, with no mentions", async () => {
		const { brandId, run } = await freshRun();
		await db.transaction((tx) => writeRunAnalysis(tx, run, null, 1, subjectsFor(brandId)));

		const { marker, mentions } = await stored(run.id);
		expect(mentions).toEqual([]);
		expect(marker).toBeDefined();
	});

	it("replaces an earlier analysis, dropping subjects that left the set", async () => {
		const { brandId, run } = await freshRun();
		await db.transaction((tx) => writeRunAnalysis(tx, run, "Globex and Acme.", 1, subjectsFor(brandId)));
		const renamed = subjectsFor(brandId, [{ id: "c-2", name: "Globex", aliases: [], domains: [] }]);
		await db.transaction((tx) => writeRunAnalysis(tx, run, "Globex and Acme.", 1, renamed));

		const { marker, mentions } = await stored(run.id);
		expect(mentions.map((m) => m.key)).toEqual([brandId, "c-2"]);
		expect(marker?.subjectFingerprint).toBe(subjectFingerprint(renamed));
	});
});

describe("tryWriteRunAnalysis", () => {
	// Two subjects under one key collide on the primary key: a real database
	// error, raised inside the caller's transaction.
	const collidingSubjects = (brandId: string): AnalysisSubject[] => [
		...subjectsFor(brandId),
		{ key: "c-1", kind: "competitor", name: "Acme" },
	];

	it("lets the caller's transaction commit the run when the analysis fails, leaving it unanalysed", async () => {
		const { brandId, promptId } = await freshRun();
		const errors: unknown[] = [];

		const runId = await db.transaction(async (tx) => {
			const [row] = await tx
				.insert(promptRuns)
				.values({
					promptId,
					brandId,
					model: "chatgpt",
					version: "test",
					webSearchEnabled: true,
					rawOutput: {},
					brandMentioned: true,
					competitorsMentioned: ["Globex"],
				})
				.returning({ id: promptRuns.id, createdAt: promptRuns.createdAt });
			await insertRunText(tx, row.id, "Globex and Acme.");
			const ok = await tryWriteRunAnalysis(
				tx,
				{ id: row.id, promptId, model: "chatgpt", createdAt: row.createdAt },
				"Globex and Acme.",
				1,
				collidingSubjects(brandId),
				(error) => errors.push(error),
			);
			expect(ok).toBe(false);
			return row.id;
		});

		expect(errors).toHaveLength(1);
		expect(await db.select().from(promptRuns).where(eq(promptRuns.id, runId))).toHaveLength(1);
		expect(await db.select().from(runTexts).where(eq(runTexts.promptRunId, runId))).toHaveLength(1);
		const { marker, mentions } = await stored(runId);
		expect(marker).toBeUndefined();
		expect(mentions).toEqual([]);
	});

	it("writes the analysis when nothing goes wrong", async () => {
		const { brandId, run } = await freshRun();
		const ok = await db.transaction((tx) => tryWriteRunAnalysis(tx, run, "Acme.", 1, subjectsFor(brandId), () => {}));
		expect(ok).toBe(true);
		expect((await stored(run.id)).marker).toBeDefined();
	});
});
