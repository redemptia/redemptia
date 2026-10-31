import { randomUUID } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { brands, competitors, organization, promptRuns, prompts } from "@workspace/lib/db/schema";
import {
	brandFacts,
	perceptionBrandSettings,
	perceptionPrompts,
	perceptionRollupDirty,
	perceptionRunStatus,
	perceptionVerdicts,
} from "@workspace/lib/db/schema-perception";
import { eq, inArray, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JevRequest, JevResponse } from "../mention-judge/jev";
import { ADVERSARIAL, MALFORMED, openai, type Provider } from "./__fixtures__/adversarial";
import { judgePendingRuns } from "./judge-runs";

let brandId: string;
let promptId: string;
let factId: string;

/** Answers every question "not mentioned" and every evidence question "none", and keeps each request. */
function judge() {
	const requests: JevRequest[] = [];
	const transport = async (request: JevRequest): Promise<JevResponse> => {
		requests.push(request);
		return {
			answers: Object.fromEntries(
				Object.entries(request.questions).map(([key, question]) => {
					const choice = key.endsWith("__evidence") ? "none" : "not_mentioned";
					return [key, { choice, probabilities: { [choice]: 1 }, confidence: 1, criteria: question.criteria }];
				}),
			),
		};
	};
	return { requests, transport };
}

const passagesOf = (request: JevRequest) => {
	const evidence = Object.entries(request.questions).find(([key]) => key.endsWith("__evidence"));
	return Object.entries(evidence?.[1].criteria ?? {})
		.filter(([key]) => /^p\d+$/.test(key))
		.map(([, passage]) => passage as string);
};

beforeEach(async () => {
	brandId = `brand-${randomUUID()}`;
	await db.insert(organization).values({ id: brandId, name: brandId, slug: brandId, createdAt: new Date() });
	await db
		.insert(brands)
		.values({ id: brandId, organizationId: brandId, name: "Acme", website: "https://acme.example", onboarded: true });
	await db.insert(competitors).values([
		{ brandId, name: "Globex" },
		{ brandId, name: "Acme Cloud" },
	]);
	await db.insert(perceptionBrandSettings).values({ brandId, enabled: true });
	[{ id: promptId }] = await db
		.insert(prompts)
		.values({ brandId, value: "How much does Acme cost?" })
		.returning({ id: prompts.id });
	await db.insert(perceptionPrompts).values({ promptId, class: "fact" });
	[{ id: factId }] = await db
		.insert(brandFacts)
		.values({ brandId, statement: "Acme's Pro plan starts at $25 per month.", validFrom: "2026-01-01" })
		.returning({ id: brandFacts.id });
});

afterEach(async () => {
	await db.delete(perceptionRollupDirty).where(eq(perceptionRollupDirty.brandId, brandId));
	await db.delete(perceptionRunStatus).where(sql`run_id IN (SELECT id FROM prompt_runs WHERE brand_id = ${brandId})`);
	await db.delete(perceptionVerdicts).where(sql`run_id IN (SELECT id FROM prompt_runs WHERE brand_id = ${brandId})`);
	await db.delete(promptRuns).where(eq(promptRuns.brandId, brandId));
	await db.delete(prompts).where(eq(prompts.brandId, brandId));
	await db.delete(brandFacts).where(eq(brandFacts.brandId, brandId));
	await db.delete(competitors).where(eq(competitors.brandId, brandId));
	await db.delete(brands).where(eq(brands.id, brandId));
	await db.delete(organization).where(eq(organization.id, brandId));
});

async function run(rawOutput: unknown, provider: Provider, at = new Date()) {
	const id = randomUUID();
	await db.insert(promptRuns).values({
		id,
		promptId,
		brandId,
		model: provider === "searchapi" ? "google-ai-overview" : "chatgpt",
		provider,
		version: "test",
		webSearchEnabled: true,
		// A JSON null, which is a value, not a missing column.
		rawOutput: (rawOutput === null ? sql`'null'::jsonb` : rawOutput) as never,
		webQueries: [],
		createdAt: at,
	});
	return id;
}

const statusOf = async (runId: string) =>
	(await db.select().from(perceptionRunStatus).where(eq(perceptionRunStatus.runId, runId)))[0]?.outcome ?? null;
const verdictsOf = (runId: string) => db.select().from(perceptionVerdicts).where(eq(perceptionVerdicts.runId, runId));

describe("real-shaped answers", () => {
	it.each(ADVERSARIAL.map((fixture) => [fixture.name, fixture] as const))("%s", async (_name, fixture) => {
		const runId = await run(fixture.rawOutput, fixture.provider);
		const spy = judge();

		await judgePendingRuns(db, spy.transport, "stub");

		if (fixture.outcome === "no_text") {
			expect(spy.requests).toHaveLength(0);
			expect(await statusOf(runId)).toBe("no_text");
			expect(await verdictsOf(runId)).toHaveLength(0);
			return;
		}
		if (fixture.outcome === "skipped") {
			expect(spy.requests).toHaveLength(0);
			expect(await verdictsOf(runId)).toMatchObject([
				{ verdict: "not_mentioned", skipped: true, probabilities: { not_mentioned: 1 } },
			]);
			return;
		}
		expect(spy.requests).toHaveLength(1);
		expect(await verdictsOf(runId)).toMatchObject([{ skipped: false }]);
		if (fixture.offered) expect(passagesOf(spy.requests[0])).toSatisfy(fixture.offered);
	});
});

describe("payloads that aren't the shape expected", () => {
	it.each(MALFORMED.map((fixture) => [fixture.name, fixture] as const))(
		"%s is set aside, not thrown",
		async (_name, fixture) => {
			const runId = await run(fixture.rawOutput, fixture.provider);
			const spy = judge();

			await expect(judgePendingRuns(db, spy.transport, "stub")).resolves.toBeDefined();

			expect(spy.requests).toHaveLength(0);
			expect(await verdictsOf(runId)).toHaveLength(0);
		},
	);

	it("never lets one bad payload hold back the answers behind it", async () => {
		const good = await run(openai("Acme starts at $25 per month."), "openai-api", new Date(Date.now() - 5000));
		for (const [i, bad] of MALFORMED.entries()) await run(bad.rawOutput, bad.provider, new Date(Date.now() - i * 100));
		const spy = judge();

		for (let job = 0; job < 4; job++) await judgePendingRuns(db, spy.transport, "stub");

		expect(await verdictsOf(good)).toHaveLength(1);
		expect(
			await db
				.select()
				.from(perceptionRunStatus)
				.where(inArray(perceptionRunStatus.outcome, ["failed"])),
		).toEqual([]);
	});
});

/** A judge whose answer to the fact question is `reply`, and whose evidence answer is "none". */
function badJudge(reply: unknown) {
	const requests: JevRequest[] = [];
	const transport = async (request: JevRequest): Promise<JevResponse> => {
		requests.push(request);
		return {
			answers: Object.fromEntries(
				Object.keys(request.questions).map((key) => [
					key,
					key.endsWith("__evidence") ? { choice: "none", probabilities: { none: 1 } } : reply,
				]),
			),
		} as never;
	};
	return { requests, transport };
}

describe("a judge that answers badly", () => {
	const replies: [string, unknown][] = [
		["a verdict that isn't one of the choices", { choice: "mostly supports", probabilities: { supports: 0.6 } }],
		["a verdict in the wrong case", { choice: "Supports", probabilities: { supports: 1 } }],
		["no probabilities", { choice: "supports" }],
		["probabilities that aren't numbers", { choice: "supports", probabilities: { supports: "high" } }],
		["no choice", { probabilities: { supports: 1 } }],
		["a null answer", null],
		["a string instead of an answer", "supports"],
	];

	it.each(replies)("stores nothing for %s, and the job carries on", async (_name, reply) => {
		const bad = await run(openai("Acme starts at $25 per month."), "openai-api", new Date(Date.now() - 1000));
		const good = await run(openai("Acme starts at $25 per month."), "openai-api", new Date(Date.now() - 5000));
		const spy = badJudge(reply);
		const first = spy.transport;
		let calls = 0;
		const transport = async (request: JevRequest) => (calls++ === 0 ? first(request) : judge().transport(request));

		await expect(judgePendingRuns(db, transport, "stub")).resolves.toBeDefined();

		expect(await verdictsOf(bad)).toEqual([]);
		expect(await verdictsOf(good)).toHaveLength(1);
	});
});

describe("how much of the corpus skips the call", () => {
	it("skips only the answers that cannot name the brand, and spends on every other judged answer", () => {
		const reachJudge = ADVERSARIAL.filter((fixture) => fixture.outcome !== "no_text");
		const skipped = reachJudge.filter((fixture) => fixture.outcome === "skipped");
		console.log(`corpus: ${skipped.length} of ${reachJudge.length} answers that have text skip the call`);
		expect(skipped.map((fixture) => fixture.name).sort()).toEqual([
			"a generic non-answer",
			"an answer about competitors only",
			"an outright refusal",
		]);
	});
});
