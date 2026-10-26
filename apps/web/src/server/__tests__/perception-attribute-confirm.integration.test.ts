import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import { perceptionPrompts } from "@workspace/lib/db/schema-perception";
import { brandAnswerCandidates } from "@workspace/lib/perception/propose-attributes";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	listAttributes,
	MAX_ACTIVE_ATTRIBUTES,
	mergeAttributes,
	retireAttribute,
	setMarketPromptText,
} from "@/server/perception-attributes-core";
import {
	ASSOCIATION_PROMPT_TEMPLATES,
	addAssociationPrompts,
	type ConfirmedAttribute,
	confirmAttributes,
	PERCEPTION_PROMPT_CAP,
	syncMarketPrompts,
} from "@/server/perception-prompts-core";
import type { PromptBrand } from "@/server/prompts-core";
import { createBrand, createCompetitor, createPrompt, createRun, deleteBrand } from "@/test/integration/stats-fixtures";

const scheduler = vi.hoisted(() => ({ create: vi.fn(async () => {}), remove: vi.fn(async () => {}) }));
vi.mock("@/lib/job-scheduler", () => ({
	createPromptJobScheduler: scheduler.create,
	removePromptJobScheduler: scheduler.remove,
}));

let brand: PromptBrand;

beforeEach(async () => {
	vi.stubEnv("DEPLOYMENT_MODE", "local");
	const id = await createBrand({ name: "Acme" });
	await createCompetitor(id, "Globex");
	const [row] = await db.select().from(brands).where(eq(brands.id, id));
	brand = { id: row.id, name: row.name, website: row.website, organizationId: row.organizationId };
});

afterEach(async () => {
	await deleteBrand(brand.id);
	vi.unstubAllEnvs();
});

const attribute = (i: number, overrides: Partial<ConfirmedAttribute> = {}): ConfirmedAttribute => ({
	label: `Quality ${i}`,
	quality: `quality number ${i}`,
	marketPromptText: `Which hosted databases rank best on quality ${i}?`,
	...overrides,
});

async function rejection(work: Promise<unknown>): Promise<string> {
	try {
		await work;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
	return "accepted";
}

async function perceptionPromptsOf(cls: "association" | "market") {
	return db
		.select({ value: prompts.value, enabled: prompts.enabled, key: perceptionPrompts.attributeKey })
		.from(prompts)
		.innerJoin(perceptionPrompts, eq(perceptionPrompts.promptId, prompts.id))
		.where(and(eq(prompts.brandId, brand.id), eq(perceptionPrompts.class, cls)));
}
const enabledMarket = async () => (await perceptionPromptsOf("market")).filter((p) => p.enabled);

describe("confirming attributes", () => {
	it("saves each with the question built from its quality, and tracks its market prompt, marked with its key", async () => {
		const result = await confirmAttributes(brand, [
			attribute(1, { label: "Self-hosting & Portability", quality: "ease of self-hosting and data portability" }),
			attribute(2),
		]);
		expect(result).toMatchObject({ marketPrompts: 2, associationPrompts: 0, promptError: null });
		const saved = await listAttributes(db, brand.id);
		// Confirmed together, so ordered by label.
		expect(saved.map((a) => [a.label, a.questionText, a.marketPromptText])).toEqual([
			[
				"Quality 2",
				"How does this answer characterise {subject}'s quality number 2?",
				"Which hosted databases rank best on quality 2?",
			],
			[
				"Self-hosting & Portability",
				"How does this answer characterise {subject}'s ease of self-hosting and data portability?",
				"Which hosted databases rank best on quality 1?",
			],
		]);
		const market = await perceptionPromptsOf("market");
		expect(market.map((p) => [p.key, p.value, p.enabled]).sort()).toEqual(
			saved.map((a) => [a.key, a.marketPromptText, true]).sort(),
		);
	});

	it("tracks no association prompts while association is off", async () => {
		await confirmAttributes(brand, [attribute(1)]);
		expect(await perceptionPromptsOf("association")).toEqual([]);
	});

	it("tracks one market prompt per attribute however many times attributes are confirmed", async () => {
		await confirmAttributes(brand, [attribute(1)]);
		const second = await confirmAttributes(brand, [attribute(2)]);
		expect(second.marketPrompts).toBe(1);
		expect(await perceptionPromptsOf("market")).toHaveLength(2);
	});

	it(`saves none when the set would pass ${MAX_ACTIVE_ATTRIBUTES} active attributes`, async () => {
		await confirmAttributes(brand, [attribute(0)]);
		const tooMany = Array.from({ length: MAX_ACTIVE_ATTRIBUTES }, (_, i) => attribute(i + 1));
		expect(await rejection(confirmAttributes(brand, tooMany))).toMatch(/at most 10 active attributes, and has 1/);
		expect(await listAttributes(db, brand.id)).toHaveLength(1);
	});

	it("refuses a quality named for a complaint, and a market prompt naming the brand or a competitor", async () => {
		expect(await rejection(confirmAttributes(brand, [attribute(1, { quality: "free project pausing" })]))).toMatch(
			/"pausing" names a complaint/,
		);
		for (const marketPromptText of ["Is Acme reliable?", "Is Globex reliable?"]) {
			expect(await rejection(confirmAttributes(brand, [attribute(1, { marketPromptText })]))).toMatch(/Name no brand/);
		}
		expect(await listAttributes(db, brand.id)).toEqual([]);
	});

	it("keeps the attributes, and says why, when the market prompts would pass the perception cap", async () => {
		for (let i = 0; i < PERCEPTION_PROMPT_CAP; i++) {
			const id = await createPrompt(brand.id, { value: `Acme fact question ${i}?` });
			await db.insert(perceptionPrompts).values({ promptId: id, class: "fact" });
		}
		const result = await confirmAttributes(brand, [attribute(1)]);
		expect(result.marketPrompts).toBe(0);
		expect(result.promptError).toMatch(/would pass the 24 perception prompts/);
		expect(await listAttributes(db, brand.id)).toHaveLength(1);
		expect(await perceptionPromptsOf("market")).toEqual([]);
	});

	it("refuses a market prompt the brand already tracks as another prompt", async () => {
		await createPrompt(brand.id, { value: "Which hosted databases rank best on quality 1?" });
		const result = await confirmAttributes(brand, [attribute(1)]);
		expect(result.promptError).toMatch(/already tracks/);
		expect(await perceptionPromptsOf("market")).toEqual([]);
	});
});

describe("keeping market prompts in step with the attributes", () => {
	it("stops a retired attribute's market prompt, keeping it", async () => {
		await confirmAttributes(brand, [attribute(1), attribute(2)]);
		const [first] = await listAttributes(db, brand.id);
		await retireAttribute(db, brand.id, first.id);
		expect(await syncMarketPrompts(brand)).toEqual({ started: 0, stopped: 1 });
		expect((await enabledMarket()).map((p) => p.key)).not.toContain(first.key);
		expect(await perceptionPromptsOf("market")).toHaveLength(2);
	});

	it("starts a new prompt for a new wording and stops the old one, so one prompt never asks two questions", async () => {
		await confirmAttributes(brand, [attribute(1)]);
		const [a] = await listAttributes(db, brand.id);
		await setMarketPromptText(db, brand.id, a.id, "Which hosted databases are best for startups?");
		expect(await syncMarketPrompts(brand)).toEqual({ started: 1, stopped: 1 });
		expect(await enabledMarket()).toEqual([
			{ value: "Which hosted databases are best for startups?", enabled: true, key: a.key },
		]);
		// Changing it back resumes the first prompt rather than creating a third.
		await setMarketPromptText(db, brand.id, a.id, "Which hosted databases rank best on quality 1?");
		expect(await syncMarketPrompts(brand)).toEqual({ started: 1, stopped: 1 });
		expect(await perceptionPromptsOf("market")).toHaveLength(2);
	});

	it("leaves the kept attribute of a merge with the merged market prompt, and stops the other's", async () => {
		await confirmAttributes(brand, [attribute(1), attribute(2)]);
		const [keep, fold] = await listAttributes(db, brand.id);
		await mergeAttributes(db, brand.id, {
			keepId: keep.id,
			retireId: fold.id,
			questionText: "How does this answer characterise {subject}'s quality one and two?",
			marketPromptText: "Which hosted databases rank best overall?",
		});
		await syncMarketPrompts(brand);
		expect(await enabledMarket()).toEqual([
			{ value: "Which hosted databases rank best overall?", enabled: true, key: keep.key },
		]);
	});
});

describe("association prompts, kept dark", () => {
	it("still tracks the templates once, all or none, when called", async () => {
		expect(await addAssociationPrompts(brand)).toBe(ASSOCIATION_PROMPT_TEMPLATES.length);
		expect(await addAssociationPrompts(brand)).toBe(0);
		expect(await perceptionPromptsOf("association")).toHaveLength(ASSOCIATION_PROMPT_TEMPLATES.length);
	});
});

describe("the warm-start candidates", () => {
	it("are the latest answer per prompt and model from the last 30 days that names the brand, with each prompt's class", async () => {
		const ordinary = await createPrompt(brand.id, { value: "best hosted postgres" });
		const fact = await createPrompt(brand.id, { value: "What does Acme cost?" });
		await db.insert(perceptionPrompts).values({ promptId: fact, class: "fact" });
		const day = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
		await createRun(brand.id, ordinary, { at: day(3), brandMentioned: true, text: "older chatgpt answer" });
		await createRun(brand.id, ordinary, { at: day(1), brandMentioned: true, text: "latest chatgpt answer" });
		await createRun(brand.id, ordinary, { at: day(1), brandMentioned: true, model: "claude", text: "claude answer" });
		await createRun(brand.id, ordinary, { at: day(1), brandMentioned: false, model: "gemini", text: "no mention" });
		await createRun(brand.id, ordinary, { at: day(40), brandMentioned: true, model: "copilot", text: "too old" });
		await createRun(brand.id, fact, { at: day(1), brandMentioned: true, text: "fact answer" });

		const candidates = await brandAnswerCandidates(db, brand.id);
		expect(candidates.map((c) => [c.model, c.promptClass, c.text]).sort()).toEqual(
			[
				["chatgpt", null, "latest chatgpt answer"],
				["claude", null, "claude answer"],
				["chatgpt", "fact", "fact answer"],
			].sort(),
		);
	});
});
