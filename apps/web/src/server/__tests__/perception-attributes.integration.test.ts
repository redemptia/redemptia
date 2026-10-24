import { db } from "@workspace/lib/db/db";
import {
	perceptionAttributes,
	perceptionAttributeVersions,
	perceptionVerdicts,
} from "@workspace/lib/db/schema-perception";
import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	AttributeRuleError,
	addAttribute,
	checkMarketPromptWording,
	checkQualityWording,
	editAttributeQuestion,
	listAttributes,
	MAX_ACTIVE_ATTRIBUTES,
	mergeAttributes,
	renameAttribute,
	retireAttribute,
	setMarketPromptText,
} from "@/server/perception-attributes-core";
import { createBrand, createCompetitor, createPrompt, createRun, deleteBrand } from "@/test/integration/stats-fixtures";

let brandId: string;

beforeEach(async () => {
	brandId = await createBrand({ name: "Acme" });
});

afterEach(async () => {
	await deleteBrand(brandId);
});

const add = (label: string, brand = brandId) =>
	addAttribute(db, brand, {
		label,
		questionText: `How does this answer treat {subject}'s ${label.toLowerCase()}?`,
		marketPromptText: `Which databases are strongest on ${label.toLowerCase()}?`,
	});

async function rejection(work: Promise<unknown>): Promise<string> {
	try {
		await work;
	} catch (error) {
		return error instanceof AttributeRuleError
			? error.message
			: `not a rule: ${String((error as { cause?: unknown }).cause ?? error)}`;
	}
	return "accepted";
}

async function attribute(id: string) {
	const [row] = await db.select().from(perceptionAttributes).where(eq(perceptionAttributes.id, id));
	return row;
}

async function versions(id: string) {
	return db
		.select({ version: perceptionAttributeVersions.questionVersion, text: perceptionAttributeVersions.questionText })
		.from(perceptionAttributeVersions)
		.where(eq(perceptionAttributeVersions.attributeId, id))
		.orderBy(asc(perceptionAttributeVersions.questionVersion));
}

async function judge(runId: string, attributeId: string, questionVersion: number) {
	await db.insert(perceptionVerdicts).values({
		runId,
		subject: "Acme",
		kind: "attribute",
		attributeId,
		questionVersion,
		verdict: "positive",
		probabilities: { positive: 1 },
		stamp: "test",
	});
}

async function newRun() {
	const prompt = await createPrompt(brandId);
	return (await createRun(brandId, prompt, { at: "2026-03-01T10:00:00Z", brandMentioned: true })).id;
}

async function verdictCount(attributeId: string) {
	return (await db.select().from(perceptionVerdicts).where(eq(perceptionVerdicts.attributeId, attributeId))).length;
}

describe("adding", () => {
	it("gives each attribute its own opaque key and records its first question as version 1", async () => {
		const a = await add("Pricing");
		const b = await add("Pricing");
		const [first, second] = [await attribute(a), await attribute(b)];
		expect(first.key).not.toBe(second.key);
		expect(first.key).not.toContain("ricing");
		expect(first.questionVersion).toBe(1);
		expect(await versions(a)).toEqual([{ version: 1, text: first.questionText }]);
	});

	it(`keeps a brand at ${MAX_ACTIVE_ATTRIBUTES} active attributes, counting only active ones`, async () => {
		const ids = [];
		for (let i = 0; i < MAX_ACTIVE_ATTRIBUTES; i++) ids.push(await add(`Quality ${i}`));
		expect(await rejection(add("One too many"))).toMatch(/at most 10 active/);
		await retireAttribute(db, brandId, ids[0]);
		expect(await rejection(add("Replacement"))).toBe("accepted");
	});

	it("never passes the cap when adds race", async () => {
		for (let i = 0; i < MAX_ACTIVE_ATTRIBUTES - 3; i++) await add(`Quality ${i}`);
		await Promise.allSettled(Array.from({ length: 10 }, (_, i) => add(`Racer ${i}`)));
		expect((await listAttributes(db, brandId)).filter((a) => !a.retiredAt)).toHaveLength(MAX_ACTIVE_ATTRIBUTES);
	});
});

describe("renaming", () => {
	it("changes the name and nothing the judge or the history reads", async () => {
		const id = await add("Pricing");
		const before = await attribute(id);
		await judge(await newRun(), id, 1);
		await renameAttribute(db, brandId, id, "Value for money");
		const after = await attribute(id);
		expect(after.label).toBe("Value for money");
		expect({ key: after.key, text: after.questionText, version: after.questionVersion }).toEqual({
			key: before.key,
			text: before.questionText,
			version: 1,
		});
		expect(await versions(id)).toHaveLength(1);
		expect(await verdictCount(id)).toBe(1);
	});
});

describe("editing the question", () => {
	it("starts a new series, keeps the old question, and leaves the old verdicts where they were", async () => {
		const id = await add("Pricing");
		const original = (await attribute(id)).questionText;
		const run = await newRun();
		await judge(run, id, 1);
		expect(await editAttributeQuestion(db, brandId, id, "Does this answer call {subject} affordable?")).toBe(2);
		expect(await versions(id)).toEqual([
			{ version: 1, text: original },
			{ version: 2, text: "Does this answer call {subject} affordable?" },
		]);
		// The same answer judged under the new question is a separate judgement, not a duplicate.
		await judge(run, id, 2);
		expect(await verdictCount(id)).toBe(2);
	});

	it("doesn't start a new series when the text is unchanged", async () => {
		const id = await add("Pricing");
		const { questionText } = await attribute(id);
		expect(await editAttributeQuestion(db, brandId, id, `  ${questionText} `)).toBe(1);
		expect(await versions(id)).toHaveLength(1);
	});
});

describe("retiring", () => {
	it("keeps the row, its key and its verdicts, and stops further edits", async () => {
		const id = await add("Pricing");
		const { key } = await attribute(id);
		await judge(await newRun(), id, 1);
		await retireAttribute(db, brandId, id);
		const retired = await attribute(id);
		expect(retired.retiredAt).not.toBeNull();
		expect(retired.key).toBe(key);
		expect(await verdictCount(id)).toBe(1);
		expect(await rejection(renameAttribute(db, brandId, id, "Cost"))).toMatch(/retired/);
		expect(await rejection(editAttributeQuestion(db, brandId, id, "Is {subject} cheap?"))).toMatch(/retired/);
	});
});

describe("merging", () => {
	it("gives the kept attribute the merged question as a new series and retires the other with its history", async () => {
		const keep = await add("Self-hosting");
		const fold = await add("Lock-in");
		const run = await newRun();
		await judge(run, keep, 1);
		await judge(run, fold, 1);
		const before = await attribute(keep);
		await mergeAttributes(db, brandId, {
			keepId: keep,
			retireId: fold,
			questionText: "How does this answer treat {subject}'s self-hosting and freedom from lock-in?",
			marketPromptText: "Which databases can you self-host without lock-in?",
		});
		const kept = await attribute(keep);
		expect(kept.key).toBe(before.key);
		expect(kept.label).toBe("Self-hosting");
		expect(kept.retiredAt).toBeNull();
		expect(kept.questionVersion).toBe(2);
		expect(kept.marketPromptText).toBe("Which databases can you self-host without lock-in?");
		expect((await versions(keep)).map((v) => v.version)).toEqual([1, 2]);
		const folded = await attribute(fold);
		expect(folded.retiredAt).not.toBeNull();
		expect(folded.questionVersion).toBe(1);
		expect(await verdictCount(fold)).toBe(1);
		expect(await verdictCount(keep)).toBe(1);
	});

	it("frees a slot under the cap", async () => {
		const ids = [];
		for (let i = 0; i < MAX_ACTIVE_ATTRIBUTES; i++) ids.push(await add(`Quality ${i}`));
		await mergeAttributes(db, brandId, {
			keepId: ids[0],
			retireId: ids[1],
			questionText: "How does this answer treat {subject}'s quality?",
			marketPromptText: "Which databases are best?",
		});
		expect(await rejection(add("New"))).toBe("accepted");
	});

	it("refuses to merge an attribute with itself, a retired one, or another brand's", async () => {
		const a = await add("Pricing");
		const b = await add("Speed");
		const other = await createBrand({ name: "Other" });
		try {
			const foreign = await add("Theirs", other);
			const merge = (keepId: string, retireId: string) =>
				mergeAttributes(db, brandId, { keepId, retireId, questionText: "Q {subject}?", marketPromptText: "P?" });
			expect(await rejection(merge(a, a))).toMatch(/two different/);
			expect(await rejection(merge(a, foreign))).toMatch(/doesn't exist/);
			await retireAttribute(db, brandId, b);
			expect(await rejection(merge(a, b))).toMatch(/retired/);
			expect((await attribute(a)).questionVersion).toBe(1);
			expect((await attribute(foreign)).retiredAt).toBeNull();
		} finally {
			await deleteBrand(other);
		}
	});
});

describe("editing the market prompt", () => {
	it("changes only its text: no new question version, no history moved", async () => {
		const id = await add("Pricing");
		await judge(await newRun(), id, 1);
		await setMarketPromptText(db, brandId, id, "Which hosted databases are cheapest at scale?");
		const after = await attribute(id);
		expect(after.marketPromptText).toBe("Which hosted databases are cheapest at scale?");
		expect(after.questionVersion).toBe(1);
		expect(await versions(id)).toHaveLength(1);
		expect(await verdictCount(id)).toBe(1);
		await retireAttribute(db, brandId, id);
		expect(await rejection(setMarketPromptText(db, brandId, id, "Which are cheapest?"))).toMatch(/retired/);
	});
});

describe("what a user may write", () => {
	it("builds the judge's question from a quality, and refuses one named for a complaint", () => {
		expect(checkQualityWording("ease of getting started")).toBe(
			"How does this answer characterise {subject}'s ease of getting started?",
		);
		expect(() => checkQualityWording("free project pausing", "Uptime")).toThrow(/Uptime: "pausing" names a complaint/);
	});

	it("refuses a market prompt naming the brand, an alias or a competitor", async () => {
		await createCompetitor(brandId, "Globex");
		for (const prompt of ["Is Acme cheap?", "Is Globex cheap?"]) {
			expect(await rejection(checkMarketPromptWording(db, brandId, prompt))).toMatch(/Name no brand/);
		}
		expect(await checkMarketPromptWording(db, brandId, "  Which hosted databases are cheapest?  ")).toBe(
			"Which hosted databases are cheapest?",
		);
	});
});
