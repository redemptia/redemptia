import { randomUUID } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { brands, citations, promptRuns, prompts } from "@workspace/lib/db/schema";
import {
	brandFacts,
	perceptionJevCalls,
	perceptionPrompts,
	perceptionVerdicts,
} from "@workspace/lib/db/schema-perception";
import { DAILY_JEV_CALL_CEILING } from "@workspace/lib/perception/limits";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getFactReadout, jevCallsToday, MAX_ALERTS } from "@/server/perception-readout-core";
import { createBrand, deleteBrand } from "@/test/integration/stats-fixtures";

let brandId: string;
let promptId: string;

async function factPrompt(brand: string, tags: string[] = []) {
	const [{ id }] = await db
		.insert(prompts)
		.values({ brandId: brand, value: "What does Acme cost?", tags })
		.returning({ id: prompts.id });
	await db.insert(perceptionPrompts).values({ promptId: id, class: "fact" });
	return id;
}

async function fact(brand: string, statement: string, sourceUrl: string | null = null) {
	const [{ id }] = await db
		.insert(brandFacts)
		.values({
			brandId: brand,
			statement,
			validFrom: "2026-01-01",
			sourceUrl,
			sourceReadAt: sourceUrl ? new Date("2026-10-01T00:00:00Z") : null,
		})
		.returning({ id: brandFacts.id });
	return id;
}

/** One answer, its citations, and a verdict on `factId`. */
async function answer(
	factId: string,
	verdict: string,
	opts: { at?: string; model?: string; cites?: string[]; prompt?: string; brand?: string; stamp?: string } = {},
) {
	const brand = opts.brand ?? brandId;
	const runId = randomUUID();
	const at = new Date(opts.at ?? "2026-10-10T12:00:00Z");
	await db.insert(promptRuns).values({
		id: runId,
		promptId: opts.prompt ?? promptId,
		brandId: brand,
		model: opts.model ?? "chatgpt",
		provider: "openrouter",
		version: "test",
		webSearchEnabled: true,
		rawOutput: {},
		webQueries: [],
		createdAt: at,
	});
	for (const [i, url] of (opts.cites ?? []).entries()) {
		await db.insert(citations).values({
			promptRunId: runId,
			promptId: opts.prompt ?? promptId,
			brandId: brand,
			model: opts.model ?? "chatgpt",
			url,
			domain: new URL(url).hostname,
			citationIndex: i,
			createdAt: at,
		});
	}
	await verdictOn(runId, factId, verdict, opts.stamp, await groundingOf(factId, opts.cites ?? []));
	return runId;
}

/** What the job records on a verdict for the answer's citations: any, the brand's site, the fact's source page. */
async function groundingOf(factId: string, cites: string[]) {
	const [{ sourceUrl }] = await db
		.select({ sourceUrl: brandFacts.sourceUrl })
		.from(brandFacts)
		.where(eq(brandFacts.id, factId));
	const page = (url: string) => {
		const u = new URL(url);
		return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
	};
	return {
		cited: cites.length > 0,
		citedSite: cites.some((url) => new URL(url).hostname.endsWith("acme.example")),
		citedSource: sourceUrl !== null && cites.some((url) => page(url) === page(sourceUrl)),
	};
}

async function verdictOn(
	runId: string,
	factId: string,
	verdict: string,
	stamp = "s1",
	flags: { cited: boolean; citedSite: boolean; citedSource: boolean } = {
		cited: false,
		citedSite: false,
		citedSource: false,
	},
) {
	await db.insert(perceptionVerdicts).values({
		runId,
		subject: "Acme",
		kind: "fact",
		factId,
		verdict,
		...flags,
		probabilities: { [verdict]: 1 },
		passage: verdict === "contradicts" ? "Acme Pro costs $40 a month." : null,
		stamp,
	});
}

const all = { from: null, to: null };

async function organizationOf(brand: string) {
	const [row] = await db.select({ id: brands.organizationId }).from(brands).where(eq(brands.id, brand));
	return row.id;
}

const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

beforeEach(async () => {
	brandId = await createBrand({ name: "Acme", website: "https://acme.example" });
	promptId = await factPrompt(brandId);
});

afterEach(async () => {
	await db.delete(perceptionJevCalls).where(eq(perceptionJevCalls.organizationId, await organizationOf(brandId)));
	await db.delete(perceptionVerdicts).where(
		// Verdicts block deleting their facts, so they go first.
		(await import("drizzle-orm")).sql`run_id IN (SELECT id FROM prompt_runs WHERE brand_id = ${brandId})`,
	);
	await deleteBrand(brandId);
});

describe("coverage", () => {
	it("counts each answer's verdict once per fact, from the latest judgement", async () => {
		const pro = await fact(brandId, "Acme Pro costs $25 per month.");
		for (let i = 0; i < 6; i++) await answer(pro, "supports");
		for (let i = 0; i < 3; i++) await answer(pro, "not_mentioned");
		const rejudged = await answer(pro, "unclear");
		// A later judge changed its mind about this answer: only the new verdict counts.
		await verdictOn(rejudged, pro, "contradicts", "s2");

		const { facts } = await getFactReadout(db, brandId, all);

		expect(facts).toMatchObject([{ factId: pro, answers: 10, stated: 6, absent: 3, unclear: 0, contradicted: 1 }]);
	});

	it("filters by UTC day, model and prompt tag", async () => {
		const pro = await fact(brandId, "Acme Pro costs $25 per month.");
		const tagged = await factPrompt(brandId, ["pricing"]);
		await answer(pro, "supports", { at: "2026-10-09T23:30:00Z" });
		await answer(pro, "supports", { at: "2026-10-10T00:30:00Z", model: "claude" });
		await answer(pro, "supports", { at: "2026-10-11T12:00:00Z", prompt: tagged });

		const count = async (filters: Parameters<typeof getFactReadout>[2]) =>
			(await getFactReadout(db, brandId, filters)).facts[0]?.answers ?? 0;
		expect(await count({ from: "2026-10-10", to: "2026-10-10" })).toBe(1);
		expect(await count({ ...all, model: "claude" })).toBe(1);
		expect(await count({ ...all, tags: ["pricing"] })).toBe(1);
		expect(await count(all)).toBe(3);
	});

	it("never reads another brand's answers or facts", async () => {
		const other = await createBrand({ name: "Globex" });
		const theirPrompt = await factPrompt(other);
		const theirs = await fact(other, "Globex costs $10.");
		await answer(theirs, "contradicts", { brand: other, prompt: theirPrompt });

		expect(await getFactReadout(db, brandId, all)).toEqual({
			facts: [],
			alerts: [],
			alertCount: 0,
			ceilingReached: false,
		});
		await db.delete(perceptionVerdicts).where((await import("drizzle-orm")).sql`fact_id = ${theirs}`);
		await deleteBrand(other);
	});
});

describe("grounding", () => {
	it("counts answers that cite anything, the fact's own source page, and the brand's own site", async () => {
		const pro = await fact(brandId, "Acme Pro costs $25 per month.", "https://acme.example/pricing");
		await answer(pro, "supports", { cites: ["https://www.acme.example/pricing/?ref=ai#plans"] });
		await answer(pro, "supports", { cites: ["https://docs.acme.example/limits"] });
		await answer(pro, "supports", { cites: ["https://review.example/acme"] });
		await answer(pro, "supports");

		const [coverage] = (await getFactReadout(db, brandId, all)).facts;

		expect(coverage.grounding).toEqual({ cited: 3, citedSource: 1, citedSite: 2 });
	});
});

describe("contradiction alerts", () => {
	it("lists each contradiction with its passage, model, date, prompt and grounding, newest first", async () => {
		const pro = await fact(brandId, "Acme Pro costs $25 per month.", "https://acme.example/pricing");
		await answer(pro, "contradicts", { at: "2026-10-01T09:00:00Z", model: "claude" });
		await answer(pro, "contradicts", { at: "2026-10-05T09:00:00Z", cites: ["https://review.example/acme"] });
		await answer(pro, "supports");

		const { alerts, alertCount } = await getFactReadout(db, brandId, all);

		expect(alertCount).toBe(2);
		expect(alerts).toMatchObject([
			{
				statement: "Acme Pro costs $25 per month.",
				passage: "Acme Pro costs $40 a month.",
				model: "chatgpt",
				answeredAt: "2026-10-05T09:00:00.000Z",
				promptId,
				sourceUrl: "https://acme.example/pricing",
				cited: true,
				citedSource: false,
				citedSite: false,
			},
			{ model: "claude", answeredAt: "2026-10-01T09:00:00.000Z", cited: false },
		]);
	});
});

describe("daily call ceiling", () => {
	async function usage(organizationId: string, day: string, calls: number) {
		await db.insert(perceptionJevCalls).values({ organizationId, day, calls });
	}

	it("reports it once the organization has used today's calls", async () => {
		const org = await organizationOf(brandId);
		await usage(org, today(), DAILY_JEV_CALL_CEILING - 1);
		expect((await getFactReadout(db, brandId, all)).ceilingReached).toBe(false);

		await db
			.update(perceptionJevCalls)
			.set({ calls: DAILY_JEV_CALL_CEILING })
			.where(eq(perceptionJevCalls.organizationId, org));
		expect((await getFactReadout(db, brandId, all)).ceilingReached).toBe(true);
	});

	it("does not report a ceiling reached yesterday", async () => {
		await usage(await organizationOf(brandId), yesterday(), DAILY_JEV_CALL_CEILING);
		expect((await getFactReadout(db, brandId, all)).ceilingReached).toBe(false);
	});

	it("does not report another organization's ceiling", async () => {
		await usage("another-organization", today(), DAILY_JEV_CALL_CEILING);
		try {
			expect((await getFactReadout(db, brandId, all)).ceilingReached).toBe(false);
		} finally {
			await db.delete(perceptionJevCalls).where(eq(perceptionJevCalls.organizationId, "another-organization"));
		}
	});
});

describe("today's call count", () => {
	it("is zero before any call, and counts today's calls only", async () => {
		expect(await jevCallsToday(db, brandId)).toBe(0);

		const org = await organizationOf(brandId);
		await db.insert(perceptionJevCalls).values([
			{ organizationId: org, day: yesterday(), calls: 900 },
			{ organizationId: org, day: today(), calls: 120 },
		]);
		expect(await jevCallsToday(db, brandId)).toBe(120);
	});
});

describe("many contradictions", () => {
	it("lists the newest alerts up to the limit and counts them all, leaving out an answer later judged fine", async () => {
		const factId = await fact(brandId, "Acme has a free plan.");
		const total = MAX_ALERTS + 2;
		for (let i = 0; i < total; i++) {
			const at = new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString();
			await answer(factId, "contradicts", { at });
		}
		const rejudged = await answer(factId, "contradicts", { at: "2026-10-02T00:00:00Z" });
		await verdictOn(rejudged, factId, "supports", "s2");

		const { alerts, alertCount, facts } = await getFactReadout(db, brandId, all);

		expect(alertCount).toBe(total);
		expect(alerts).toHaveLength(MAX_ALERTS);
		expect(alerts.map((a) => a.answeredAt)).toEqual([...alerts.map((a) => a.answeredAt)].sort().reverse());
		expect(alerts[0].answeredAt).toBe(new Date(Date.UTC(2026, 9, 1, 0, total - 1)).toISOString());
		expect(facts[0]).toMatchObject({ answers: total + 1, contradicted: total, stated: 1 });
	});
});
