import { randomUUID } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { brands, organization, promptRuns, prompts } from "@workspace/lib/db/schema";
import {
	brandFacts,
	perceptionBrandSettings,
	perceptionJevCalls,
	perceptionPrompts,
	perceptionRollupDirty,
	perceptionRunStatus,
	perceptionVerdicts,
} from "@workspace/lib/db/schema-perception";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JEV_MODEL, type JevRequest, type JevResponse } from "../mention-judge/jev";
import { MAX_FIRST_CONTACT_CALLS, planFirstContact, runFirstContact, shapeOf, unitPrices } from "./first-contact";

let brandId: string;
const promptIds: string[] = [];

beforeEach(async () => {
	brandId = `brand-${randomUUID()}`;
	promptIds.length = 0;
	await db.insert(organization).values({ id: brandId, name: brandId, slug: brandId, createdAt: new Date() });
	await db
		.insert(brands)
		.values({ id: brandId, organizationId: brandId, name: "Acme", website: "https://acme.example", onboarded: true });
	await db.insert(brandFacts).values({ brandId, statement: "Acme has a free plan.", validFrom: "2026-01-01" });
	for (let i = 0; i < 3; i++) {
		const [{ id }] = await db
			.insert(prompts)
			.values({ brandId, value: `Question ${i + 1} about Acme` })
			.returning({ id: prompts.id });
		await db.insert(perceptionPrompts).values({ promptId: id, class: "fact" });
		promptIds.push(id);
	}
});

afterEach(async () => {
	await db.delete(perceptionRollupDirty).where(eq(perceptionRollupDirty.brandId, brandId));
	await db.delete(perceptionRunStatus).where(sql`run_id IN (SELECT id FROM prompt_runs WHERE brand_id = ${brandId})`);
	await db.delete(perceptionVerdicts).where(sql`run_id IN (SELECT id FROM prompt_runs WHERE brand_id = ${brandId})`);
	await db.delete(perceptionJevCalls).where(eq(perceptionJevCalls.organizationId, brandId));
	await db.delete(promptRuns).where(eq(promptRuns.brandId, brandId));
	await db.delete(perceptionPrompts).where(sql`prompt_id IN (SELECT id FROM prompts WHERE brand_id = ${brandId})`);
	await db.delete(prompts).where(eq(prompts.brandId, brandId));
	await db.delete(brandFacts).where(eq(brandFacts.brandId, brandId));
	await db.delete(perceptionBrandSettings).where(eq(perceptionBrandSettings.brandId, brandId));
	await db.delete(brands).where(eq(brands.id, brandId));
	await db.delete(organization).where(eq(organization.id, brandId));
});

async function answer(promptIndex: number, text: string, minutesAgo = 0) {
	const id = randomUUID();
	await db.insert(promptRuns).values({
		id,
		promptId: promptIds[promptIndex],
		brandId,
		model: "chatgpt",
		provider: "openrouter",
		version: "test",
		webSearchEnabled: true,
		rawOutput: { choices: [{ message: { content: text } }] },
		webQueries: [],
		createdAt: new Date(Date.now() - minutesAgo * 60_000),
	});
	return id;
}

/** A judge that stands in for Jev: answers within the choices, reports usage, and remembers the replies it gave. */
function judge() {
	const replies: JevResponse[] = [];
	const transport = async (request: JevRequest): Promise<JevResponse> => {
		const reply: JevResponse = {
			answers: Object.fromEntries(
				Object.entries(request.questions).map(([key, question]) => {
					const choice = key.endsWith("__evidence") ? "none" : "supports";
					return [key, { choice, probabilities: { [choice]: 0.9 }, confidence: 0.8 } as never];
				}),
			),
			usage: { input_tokens: 1500, output_tokens: 40 },
			// The judge names itself; a reply from any other model is refused.
			...{ model: JEV_MODEL },
		};
		replies.push(reply);
		return reply;
	};
	return { transport, replies };
}

describe("the staged first run", () => {
	it("judges a few answers without turning the brand on, keeps each reply verbatim beside what was stored, and stops", async () => {
		const named = await answer(0, "Acme has a free plan for small teams.", 1);
		const refusal = await answer(1, "I'm sorry, but I can't help with that request.", 2);
		const spy = judge();

		const report = await runFirstContact(db, { brandId, transport: spy.transport });

		expect(report.stoppedBecause).toBe("done");
		expect(report.totals).toMatchObject({ runs: 2, calls: 1, questions: 2, inputTokens: 1500, outputTokens: 40 });
		const [first, second] = report.runs.sort((a, b) => (a.runId === named ? -1 : b.runId === named ? 1 : 0));
		expect(first.calls[0].response).toEqual(spy.replies[0]);
		expect(first.calls[0].request.answer).toBe("Acme has a free plan for small teams.");
		expect(first.ours.verdicts).toMatchObject([{ verdict: "supports", skipped: false }]);
		expect(second.runId).toBe(refusal);
		expect(second).toMatchObject({ skipRule: "would skip", shape: ["refusal"], calls: [] });
		expect(second.ours.verdicts).toMatchObject([{ verdict: "not_mentioned", skipped: true }]);
		expect(await db.select().from(perceptionBrandSettings).where(eq(perceptionBrandSettings.brandId, brandId))).toEqual(
			[],
		);
	});

	it("never goes past its call budget, and leaves the answers it didn't reach for the normal job", async () => {
		const ids = [await answer(0, "Acme one.", 1), await answer(1, "Acme two.", 2), await answer(2, "Acme three.", 3)];
		const spy = judge();

		const report = await runFirstContact(db, { brandId, transport: spy.transport, maxCalls: 2 });

		expect(report.stoppedBecause).toBe("budget");
		expect(spy.replies).toHaveLength(2);
		expect(report.totals.calls).toBe(2);
		const judged = await db
			.select()
			.from(perceptionVerdicts)
			.where(
				sql`run_id IN (${sql.join(
					ids.map((id) => sql`${id}::uuid`),
					sql`, `,
				)})`,
			);
		expect(judged).toHaveLength(2);
	});

	it("caps the budget at a hundred calls whatever it is asked for", async () => {
		await answer(0, "Acme is here.");
		const report = await runFirstContact(db, { brandId, transport: judge().transport, maxCalls: 5000 });
		expect(report.limits.maxCalls).toBe(MAX_FIRST_CONTACT_CALLS);
	});

	it("is done after one pass: a second run finds nothing pending and calls no one", async () => {
		await answer(0, "Acme has a free plan.");
		await runFirstContact(db, { brandId, transport: judge().transport });
		const again = judge();

		const second = await runFirstContact(db, { brandId, transport: again.transport });

		expect(second.stoppedBecause).toBe("nothing pending");
		expect(again.replies).toHaveLength(0);
	});

	it("takes the newest answers of the first prompts only", async () => {
		const old = await answer(0, "Acme old.", 100);
		await answer(0, "Acme new one.", 1);
		await answer(0, "Acme new two.", 2);

		const plan = await planFirstContact(db, { brandId, perPrompt: 2 });

		expect(plan.selected.map((run) => run.id)).not.toContain(old);
		expect(plan.selected).toHaveLength(2);
	});

	it("plans without calling anyone or writing anything", async () => {
		await answer(0, "Acme has a free plan.");
		await planFirstContact(db, { brandId });
		expect(
			await db
				.select()
				.from(perceptionVerdicts)
				.where(sql`run_id IN (SELECT id FROM prompt_runs WHERE brand_id = ${brandId})`),
		).toEqual([]);
	});

	it("refuses a brand with no facts", async () => {
		await db.delete(brandFacts).where(eq(brandFacts.brandId, brandId));
		await expect(runFirstContact(db, { brandId, transport: judge().transport })).rejects.toThrow(/no facts/);
	});
});

describe("reading the report", () => {
	it("labels refusals, hedges and counterfactuals by their words, for sorting only", () => {
		expect(shapeOf("I'm sorry, but I can't help with that.")).toEqual(["refusal"]);
		expect(shapeOf("I don't have reliable information about its pricing.")).toEqual(["hedge"]);
		expect(shapeOf("Unlike Acme, Globex is free.")).toEqual(["contrast or counterfactual"]);
		expect(shapeOf("Acme starts at $25.")).toEqual(["plain"]);
	});

	it("prices the three ways Jev might bill from what the first run was charged", () => {
		const prices = unitPrices(
			{ totals: { runs: 10, calls: 10, questions: 20, answerChars: 60_000, inputTokens: 25_000, outputTokens: 400 } },
			0.5,
		);
		expect(prices.perCall).toBeCloseTo(0.05);
		expect(prices.perQuestion).toBeCloseTo(0.025);
		expect(prices.perMillionTokens).toBeCloseTo(20);
		expect(prices.tokensAreMeasured).toBe(true);
		expect(prices.ceilingDayUsd).toBeCloseTo(100);
		expect(
			unitPrices(
				{ totals: { runs: 1, calls: 1, questions: 2, answerChars: 4000, inputTokens: null, outputTokens: null } },
				0.01,
			).tokensAreMeasured,
		).toBe(false);
		expect(() =>
			unitPrices(
				{ totals: { runs: 0, calls: 0, questions: 0, answerChars: 0, inputTokens: null, outputTokens: null } },
				1,
			),
		).toThrow();
	});
});
