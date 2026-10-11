import { db } from "@workspace/lib/db/db";
import { competitors, promptRuns, runMentionAnalyses, runSubjectMentions, runTexts } from "@workspace/lib/db/schema";
import { reconcileRunAnalyses } from "@workspace/lib/enrichment/reconcile";
import { insertRunText } from "@workspace/lib/run-texts";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createBrand, createCompetitor, createPrompt, createRun, deleteBrand } from "@/test/integration/stats-fixtures";

const brandIds: string[] = [];

/** A brand with Globex as its competitor and one run per answer, each with run_texts but no analysis. */
async function brandWithRuns(answers: (string | null)[]) {
	const brandId = await createBrand({ name: "Acme" });
	brandIds.push(brandId);
	await createCompetitor(brandId, "Globex");
	const promptId = await createPrompt(brandId);
	const runIds: string[] = [];
	for (const [i, answer] of answers.entries()) {
		const run = await createRun(brandId, promptId, {
			at: `2026-10-01T12:00:${String(i).padStart(2, "0")}Z`,
			brandMentioned: false,
		});
		if (answer !== null) await insertRunText(db, run.id, answer);
		runIds.push(run.id);
	}
	return { brandId, promptId, runIds };
}

const reconcile = (brandId: string, overrides: Partial<Parameters<typeof reconcileRunAnalyses>[0]> = {}) =>
	reconcileRunAnalyses({ brandId, batchSize: 50, pauseMs: 0, dryRun: false, ...overrides });

async function mentionedNames(runIds: string[]) {
	const rows = await db
		.select({ run: runSubjectMentions.promptRunId, name: runSubjectMentions.subjectName })
		.from(runSubjectMentions)
		.where(inArray(runSubjectMentions.promptRunId, runIds));
	return runIds.map((id) =>
		rows
			.filter((row) => row.run === id)
			.map((row) => row.name)
			.sort(),
	);
}

async function markerCount(runIds: string[]) {
	return (await db.select().from(runMentionAnalyses).where(inArray(runMentionAnalyses.promptRunId, runIds))).length;
}

afterAll(async () => {
	for (const id of brandIds) await deleteBrand(id);
});

describe("reconcileRunAnalyses", () => {
	it("analyses runs that have never been analysed", async () => {
		const { brandId, runIds } = await brandWithRuns(["Acme wins.", "Globex wins.", "Nobody wins."]);
		const result = await reconcile(brandId);

		expect(result).toEqual({ analysed: 3, remaining: 0, awaitingText: 0 });
		expect(await mentionedNames(runIds)).toEqual([["Acme"], ["Globex"], []]);
		expect(await markerCount(runIds)).toBe(3);
	});

	it("leaves current runs alone, so a second pass writes nothing", async () => {
		const { brandId } = await brandWithRuns(["Acme wins.", "Globex wins."]);
		await reconcile(brandId);
		expect(await reconcile(brandId)).toEqual({ analysed: 0, remaining: 0, awaitingText: 0 });
	});

	it("re-analyses a run analysed by older analyzer code", async () => {
		const { brandId, runIds } = await brandWithRuns(["Acme wins.", "Globex wins."]);
		await reconcile(brandId);
		await db
			.update(runMentionAnalyses)
			.set({ analyzerVersion: 0 })
			.where(eq(runMentionAnalyses.promptRunId, runIds[0]));

		expect((await reconcile(brandId)).analysed).toBe(1);
	});

	it("re-analyses a run whose text was re-extracted, from the new text", async () => {
		const { brandId, runIds } = await brandWithRuns(["Acme wins.", "Globex wins."]);
		await reconcile(brandId);
		await db
			.update(runTexts)
			.set({ text: "Globex, not Acme.", extractorVersion: 2 })
			.where(eq(runTexts.promptRunId, runIds[0]));

		expect((await reconcile(brandId)).analysed).toBe(1);
		expect(await mentionedNames(runIds)).toEqual([["Acme", "Globex"], ["Globex"]]);
		const [marker] = await db.select().from(runMentionAnalyses).where(eq(runMentionAnalyses.promptRunId, runIds[0]));
		expect(marker.extractorVersion).toBe(2);
	});

	it("re-analyses every run of a brand whose subjects changed, picking up a new competitor", async () => {
		const { brandId, runIds } = await brandWithRuns(["Initech and Acme.", "Globex wins."]);
		await reconcile(brandId);
		await createCompetitor(brandId, "Initech");

		expect((await reconcile(brandId)).analysed).toBe(2);
		expect(await mentionedNames(runIds)).toEqual([["Acme", "Initech"], ["Globex"]]);
	});

	it("drops a deleted competitor's mentions", async () => {
		const { brandId, runIds } = await brandWithRuns(["Globex and Acme."]);
		await reconcile(brandId);
		await db.delete(competitors).where(and(eq(competitors.brandId, brandId), eq(competitors.name, "Globex")));

		await reconcile(brandId);
		expect(await mentionedNames(runIds)).toEqual([["Acme"]]);
	});

	it("counts without writing on a dry run", async () => {
		const { brandId, runIds } = await brandWithRuns(["Acme wins.", "Globex wins."]);
		expect(await reconcile(brandId, { dryRun: true })).toEqual({ analysed: 0, remaining: 2, awaitingText: 0 });
		expect(await markerCount(runIds)).toBe(0);
	});

	it("leaves a run with no run_texts row unanalysed, and says so", async () => {
		const { brandId, runIds } = await brandWithRuns(["Acme wins.", null]);
		expect(await reconcile(brandId)).toEqual({ analysed: 1, remaining: 0, awaitingText: 1 });
		expect(await markerCount([runIds[1]])).toBe(0);
	});

	it("picks up where an interrupted pass stopped", async () => {
		const { brandId, runIds } = await brandWithRuns(["Acme.", "Globex.", "Acme.", "Globex."]);
		let batches = 0;
		await expect(
			reconcile(brandId, {
				batchSize: 1,
				onProgress: () => {
					if (++batches === 3) throw new Error("interrupted");
				},
			}),
		).rejects.toThrow("interrupted");
		const before = await markerCount(runIds);
		expect(before).toBeGreaterThan(0);
		expect(before).toBeLessThan(4);

		expect((await reconcile(brandId)).analysed).toBe(4 - before);
		expect(await markerCount(runIds)).toBe(4);
	});

	it("walks past runs saved within the same millisecond", async () => {
		const { brandId, promptId } = await brandWithRuns([]);
		const ids: string[] = [];
		for (const micros of ["100", "200", "300"]) {
			const [row] = await db
				.insert(promptRuns)
				.values({
					promptId,
					brandId,
					model: "chatgpt",
					version: "test",
					webSearchEnabled: true,
					rawOutput: {},
					brandMentioned: false,
					createdAt: sql`${`2026-10-01 12:00:00.000${micros}+00`}::timestamptz`,
				})
				.returning({ id: promptRuns.id });
			await insertRunText(db, row.id, "Acme.");
			ids.push(row.id);
		}

		expect((await reconcile(brandId, { batchSize: 1 })).analysed).toBe(3);
		expect(await markerCount(ids)).toBe(3);
	});

	it("lets two passes run at once without colliding", async () => {
		const answers = Array.from({ length: 20 }, (_, i) => (i % 2 ? "Globex and Acme." : "Acme."));
		const { brandId, runIds } = await brandWithRuns(answers);

		const results = await Promise.all([reconcile(brandId, { batchSize: 3 }), reconcile(brandId, { batchSize: 3 })]);

		expect(results[0].analysed + results[1].analysed).toBeGreaterThanOrEqual(20);
		expect(await markerCount(runIds)).toBe(20);
		const names = await mentionedNames(runIds);
		expect(names.filter((n) => n.length === 2)).toHaveLength(10);
	});
});
