import { db } from "@workspace/lib/db/db";
import { brandFacts, rollupPerceptionDaily, rollupProminenceDaily } from "@workspace/lib/db/schema-perception";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPerceptionHistory } from "@/server/perception-history-core";
import { createBrand, createPrompt, deleteBrand } from "@/test/integration/stats-fixtures";

let brandId: string;
let otherBrandId: string;
let promptId: string;
let otherPromptId: string;
let factId: string;
const all = { from: null, to: null };

beforeEach(async () => {
	brandId = await createBrand({ name: "Acme" });
	otherBrandId = await createBrand({ name: "Acme" });
	promptId = await createPrompt(brandId);
	otherPromptId = await createPrompt(otherBrandId);
	[{ id: factId }] = await db
		.insert(brandFacts)
		.values({ brandId, statement: "Acme has a free plan.", validFrom: "2026-01-01" })
		.returning({ id: brandFacts.id });
});

afterEach(async () => {
	for (const id of [brandId, otherBrandId]) {
		await db.delete(rollupPerceptionDaily).where(eq(rollupPerceptionDaily.brandId, id));
		await db.delete(rollupProminenceDaily).where(eq(rollupProminenceDaily.brandId, id));
	}
	await db.delete(brandFacts).where(eq(brandFacts.brandId, brandId));
	await deleteBrand(brandId);
	await deleteBrand(otherBrandId);
});

async function factRow(
	day: string,
	verdict: string,
	answers: number,
	stamp = "s1",
	model = "chatgpt",
	brand = brandId,
) {
	await db.insert(rollupPerceptionDaily).values({
		brandId: brand,
		day,
		promptId: brand === brandId ? promptId : otherPromptId,
		promptClass: "fact",
		model,
		subject: "Acme",
		kind: "fact",
		refKey: factId,
		stamp,
		verdict,
		answers,
	});
}

async function marketRow(
	day: string,
	fingerprint: string,
	over: Partial<typeof rollupProminenceDaily.$inferInsert> = {},
) {
	await db.insert(rollupProminenceDaily).values({
		brandId,
		day,
		promptId,
		attributeKey: "attr_speed",
		model: "chatgpt",
		subjectName: "Acme",
		competitorSetFingerprint: fingerprint,
		answers: 10,
		mentionedAnswers: 5,
		positionedAnswers: 5,
		positionSum: 10,
		inversePositionSum: 3,
		...over,
	});
}

describe("fact coverage over time", () => {
	it("gives one number per day, from the judge version that covered most of it, and says what was left out", async () => {
		await factRow("2026-10-10", "supports", 30, "old");
		await factRow("2026-10-10", "not_mentioned", 10, "old");
		await factRow("2026-10-10", "supports", 12, "new");
		await factRow("2026-10-11", "supports", 20, "new");

		const [fact] = (await getPerceptionHistory(db, brandId, all)).facts;

		expect(fact.days).toHaveLength(2);
		expect(fact.days[0]).toMatchObject({
			day: "2026-10-10",
			answers: 40,
			stated: 30,
			absent: 10,
			stamp: "old",
			otherStampAnswers: 12,
		});
		expect(fact.days[1]).toMatchObject({ day: "2026-10-11", answers: 20, stamp: "new", otherStampAnswers: 0 });
		expect(fact.versionChanges).toEqual(["2026-10-11"]);
	});

	it("sums models and prompts within a version, and narrows to one model on request", async () => {
		await factRow("2026-10-10", "supports", 6, "s1", "chatgpt");
		await factRow("2026-10-10", "supports", 4, "s1", "claude");

		expect((await getPerceptionHistory(db, brandId, all)).facts[0].days[0].answers).toBe(10);
		expect((await getPerceptionHistory(db, brandId, { ...all, model: "claude" })).facts[0].days[0].answers).toBe(4);
	});

	it("starts where the data starts, and leaves out days with none", async () => {
		await factRow("2026-10-10", "supports", 20);
		await factRow("2026-10-14", "supports", 20);

		const history = await getPerceptionHistory(db, brandId, { from: "2026-10-12", to: null });

		expect(history.facts[0].days.map((d) => d.day)).toEqual(["2026-10-14"]);
		expect(history.factsFirstDay).toBe("2026-10-10");
		expect(history.marketFirstDay).toBeNull();
	});

	it("never shows another brand's rollup", async () => {
		await factRow("2026-10-10", "supports", 99, "s1", "chatgpt", otherBrandId);
		const history = await getPerceptionHistory(db, brandId, all);
		expect(history.facts).toEqual([]);
		expect(history.factsFirstDay).toBeNull();
	});
});

describe("prominence over time", () => {
	it("uses the competitor set that ranked most of the day, marks where it changes, and reports the rest", async () => {
		await marketRow("2026-10-10", "setA");
		await marketRow("2026-10-11", "setA", { answers: 6 });
		await marketRow("2026-10-11", "setB", { answers: 14, positionSum: 28 });

		const { market } = await getPerceptionHistory(db, brandId, all);

		expect(market.days.map((d) => [d.day, d.competitorSet, d.answers, d.otherSetAnswers])).toEqual([
			["2026-10-10", "setA", 10, 0],
			["2026-10-11", "setB", 14, 6],
		]);
		expect(market.versionChanges).toEqual(["2026-10-11"]);
	});

	it("narrows to one attribute, and reads only the brand's own rows", async () => {
		await marketRow("2026-10-10", "setA");
		await marketRow("2026-10-10", "setA", { attributeKey: "attr_other", promptId, model: "claude", answers: 7 });
		await marketRow("2026-10-10", "setA", { subjectName: "Globex", model: "gemini", answers: 99 });

		const all2 = await getPerceptionHistory(db, brandId, all);
		expect(all2.market.days[0].answers).toBe(17);
		const one = await getPerceptionHistory(db, brandId, { ...all, attributeKey: "attr_other" });
		expect(one.market.days[0].answers).toBe(7);
	});
});
