import { randomUUID } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import { perceptionPrompts } from "@workspace/lib/db/schema-perception";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FactRuleError, listFacts } from "@/server/perception-facts-core";
import {
	acceptFactSuggestion,
	addFactPrompt,
	listFactPrompts,
	PERCEPTION_PROMPT_CAP,
	promptHeadroom,
	stopTrackingFactPrompt,
} from "@/server/perception-prompts-core";
import type { PromptBrand } from "@/server/prompts-core";
import { createBrand, createPrompt, createRun, deleteBrand } from "@/test/integration/stats-fixtures";

const scheduler = vi.hoisted(() => ({ create: vi.fn(async () => {}), remove: vi.fn(async () => {}) }));
vi.mock("@/lib/job-scheduler", () => ({
	createPromptJobScheduler: scheduler.create,
	removePromptJobScheduler: scheduler.remove,
}));

let brand: PromptBrand;

async function loadBrand(id: string): Promise<PromptBrand> {
	const [row] = await db.select().from(brands).where(eq(brands.id, id));
	return { id: row.id, name: row.name, website: row.website, organizationId: row.organizationId };
}

async function rejection(work: Promise<unknown>): Promise<string> {
	try {
		await work;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
	return "accepted";
}

async function addPerceptionPrompts(brandId: string, n: number) {
	for (let i = 0; i < n; i++) {
		const id = await createPrompt(brandId, { value: `Acme perception question ${i}?` });
		await db.insert(perceptionPrompts).values({ promptId: id, class: i % 2 ? "association" : "fact" });
	}
}

beforeEach(async () => {
	vi.stubEnv("DEPLOYMENT_MODE", "local");
	scheduler.create.mockClear();
	brand = await loadBrand(await createBrand({ name: "Acme" }));
});

afterEach(async () => {
	await deleteBrand(brand.id);
	vi.unstubAllEnvs();
});

describe("tracking a fact prompt", () => {
	it("creates the prompt already marked as a fact prompt, and schedules it", async () => {
		const id = await addFactPrompt(brand, "  Is Acme   self-hostable? ");

		expect(await listFactPrompts(db, brand.id)).toEqual([{ id, value: "Is Acme self-hostable?", enabled: true }]);
		expect(scheduler.create).toHaveBeenCalledWith(id);
		expect(await promptHeadroom(db, brand.id)).toMatchObject({
			factPrompts: 1,
			perception: { used: 1, cap: PERCEPTION_PROMPT_CAP },
			brand: { used: 1, cap: 100 },
		});
	});

	it.each([
		["What does it cost?", /Name Acme/],
		["Acme pricing", /question mark/],
	])("refuses %j", async (question, message) => {
		expect(await rejection(addFactPrompt(brand, question))).toMatch(message);
		expect(await listFactPrompts(db, brand.id)).toEqual([]);
	});

	it("refuses a question the brand already tracks, in any case or spacing", async () => {
		await createPrompt(brand.id, { value: "Is Acme self-hostable?" });
		expect(await rejection(addFactPrompt(brand, "is acme  SELF-HOSTABLE?"))).toMatch(/already tracks/);
	});
});

describe("the caps", () => {
	it(`refuses a perception prompt past ${PERCEPTION_PROMPT_CAP}, counting every class, and allows one after stopping one`, async () => {
		await addPerceptionPrompts(brand.id, PERCEPTION_PROMPT_CAP);

		expect(await rejection(addFactPrompt(brand, "Is Acme open source?"))).toMatch(/at most 24 perception prompts/);
		const [first] = await listFactPrompts(db, brand.id);
		await stopTrackingFactPrompt(brand, first.id);
		expect(await rejection(addFactPrompt(brand, "Is Acme open source?"))).toBe("accepted");
	});

	it("refuses past elmo's 100 prompts per brand, counting prompts it doesn't show", async () => {
		for (let i = 0; i < 100; i++) await createPrompt(brand.id, { value: `ordinary prompt ${i}`, enabled: i < 10 });

		expect(await rejection(addFactPrompt(brand, "Is Acme open source?"))).toMatch(/at most 100 prompts/);
		expect(await listFactPrompts(db, brand.id)).toEqual([]);
	});

	it("never passes the perception cap when adds race", async () => {
		await addPerceptionPrompts(brand.id, PERCEPTION_PROMPT_CAP - 2);

		await Promise.allSettled(
			Array.from({ length: 8 }, (_, i) => addFactPrompt(brand, `Does Acme support feature ${i}?`)),
		);

		expect((await promptHeadroom(db, brand.id)).perception.used).toBe(PERCEPTION_PROMPT_CAP);
	});
});

describe("stopping a fact prompt", () => {
	it("disables it and keeps its runs", async () => {
		const id = await addFactPrompt(brand, "Is Acme self-hostable?");
		await createRun(brand.id, id, { at: "2026-10-01T10:00:00Z", brandMentioned: true });

		await stopTrackingFactPrompt(brand, id);

		expect(await listFactPrompts(db, brand.id)).toEqual([{ id, value: "Is Acme self-hostable?", enabled: false }]);
		expect(await db.select().from(prompts).where(eq(prompts.id, id))).toHaveLength(1);
		expect(scheduler.remove).toHaveBeenCalledWith(id);
	});

	it("refuses another brand's fact prompt, and an ordinary prompt", async () => {
		const other = await loadBrand(await createBrand({ name: "Globex" }));
		const theirs = await addFactPrompt(other, "Is Globex self-hostable?");
		const ordinary = await createPrompt(brand.id, { value: "best crm" });

		expect(await rejection(stopTrackingFactPrompt(brand, theirs))).toMatch(/isn't one of this brand's fact prompts/);
		expect(await rejection(stopTrackingFactPrompt(brand, ordinary))).toMatch(/isn't one of this brand's fact prompts/);
		expect(await listFactPrompts(db, other.id)).toMatchObject([{ id: theirs, enabled: true }]);
		await deleteBrand(other.id);
	});

	it("reports a broken rule as a rule, not a crash", async () => {
		expect(await rejection(stopTrackingFactPrompt(brand, randomUUID()))).toMatch(/isn't one of/);
		await expect(stopTrackingFactPrompt(brand, randomUUID())).rejects.toBeInstanceOf(FactRuleError);
	});
});

describe("accepting a suggestion", () => {
	const suggestion = {
		statement: "Acme can be self-hosted.",
		validFrom: "2026-10-01",
		question: "Is Acme self-hostable?",
	};

	it("records the fact and tracks its question", async () => {
		const { factId, promptId, promptError } = await acceptFactSuggestion(brand, suggestion, "2026-10-23");

		expect(promptError).toBeNull();
		expect((await listFacts(db, brand.id)).map((f) => f.id)).toEqual([factId]);
		expect((await listFactPrompts(db, brand.id)).map((p) => p.id)).toEqual([promptId]);
	});

	it("keeps the fact the user confirmed when its question can't be tracked, and says why", async () => {
		await addPerceptionPrompts(brand.id, PERCEPTION_PROMPT_CAP);

		const { promptId, promptError } = await acceptFactSuggestion(brand, suggestion, "2026-10-23");

		expect(promptId).toBeNull();
		expect(promptError).toMatch(/at most 24 perception prompts/);
		expect((await listFacts(db, brand.id)).map((f) => f.statement)).toEqual(["Acme can be self-hosted."]);
	});

	it("records nothing when the fact itself breaks a rule", async () => {
		expect(await rejection(acceptFactSuggestion(brand, { ...suggestion, statement: "Is Acme self-hosted?" }))).toMatch(
			/assertion/,
		);
		expect(await listFactPrompts(db, brand.id)).toEqual([]);
	});
});
