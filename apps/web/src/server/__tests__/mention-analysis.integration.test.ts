import { db } from "@workspace/lib/db/db";
import { competitors, promptRuns, runMentionAnalyses, runSubjectMentions, runTexts } from "@workspace/lib/db/schema";
import { ANALYZER_VERSION, brandSubjects, subjectFingerprint } from "@workspace/lib/enrichment";
import { loadBrandSubjects, tryWriteRunAnalysis, writeRunAnalysis } from "@workspace/lib/enrichment/write";
import { insertRunText } from "@workspace/lib/run-texts";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { holdBrandLock } from "@/test/integration/brand-analysis-lock";
import { createBrand, createCompetitor, createPrompt, createRun, deleteBrand } from "@/test/integration/stats-fixtures";

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

	it("dates each mention exactly as its run, to the microsecond", async () => {
		const { brandId, promptId } = await freshRun();
		// now() carries microseconds, which a JS Date round trip would drop.
		const [row] = await db
			.insert(promptRuns)
			.values({
				promptId,
				brandId,
				model: "chatgpt",
				version: "test",
				webSearchEnabled: true,
				rawOutput: {},
				brandMentioned: true,
				createdAt: sql`'2026-10-01 12:00:00.123456+00'`,
			})
			.returning({ id: promptRuns.id });
		await db.transaction((tx) =>
			writeRunAnalysis(tx, { id: row.id, promptId, model: "chatgpt" }, "Acme.", 1, subjectsFor(brandId)),
		);

		const { rows } = await db.execute<{ same: boolean }>(sql`
			SELECT m.created_at = r.created_at AS same
			FROM run_subject_mentions m JOIN prompt_runs r ON r.id = m.prompt_run_id
			WHERE m.prompt_run_id = ${row.id}`);
		expect(rows).toEqual([{ same: true }]);
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
					competitorsMentioned: [],
				})
				.returning({ id: promptRuns.id });
			await insertRunText(tx, row.id, "Acme leads.");
			// A prompt id that isn't a uuid fails the mention insert in the database,
			// after the delete has run: a real statement error inside the caller's
			// transaction.
			const ok = await tryWriteRunAnalysis(
				tx,
				{ id: row.id, promptId: "not-a-uuid", model: "chatgpt", brandId },
				"Acme leads.",
				1,
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

	it("doesn't let a failing error reporter fail the caller either", async () => {
		const { run } = await freshRun();
		const ok = await db.transaction((tx) =>
			tryWriteRunAnalysis(tx, { ...run, promptId: "not-a-uuid" }, "Acme leads.", 1, () => {
				throw new Error("reporter down");
			}),
		);
		expect(ok).toBe(false);
		expect((await stored(run.id)).marker).toBeUndefined();
	});

	it("reads the brand's subjects only after a writer ahead of it on the brand commits", async () => {
		const { brandId, run } = await freshRun();
		const ahead = holdBrandLock(brandId, (tx) => tx.insert(competitors).values({ brandId, name: "Globex" }));
		await ahead.locked;
		const write = db.transaction((tx) => tryWriteRunAnalysis(tx, run, "Globex and Acme.", 1, () => {}));
		await new Promise((resolve) => setTimeout(resolve, 200));
		ahead.release();
		await ahead.done;
		expect(await write).toBe(true);

		expect((await stored(run.id)).mentions).toHaveLength(2);
	});

	it("analyses against the brand's subjects as they stand when it writes", async () => {
		const { brandId, run } = await freshRun();
		await createCompetitor(brandId, "Globex", ["globex.example"]);
		const ok = await db.transaction((tx) => tryWriteRunAnalysis(tx, run, "Globex and Acme.", 1, () => {}));
		expect(ok).toBe(true);

		const { marker, mentions } = await stored(run.id);
		expect(mentions).toHaveLength(2);
		const current = await loadBrandSubjects(db, brandId);
		expect(marker?.subjectFingerprint).toBe(subjectFingerprint(current ?? []));
	});
});
