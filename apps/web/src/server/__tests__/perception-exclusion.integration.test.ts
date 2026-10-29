import { db } from "@workspace/lib/db/db";
import { perceptionPrompts } from "@workspace/lib/db/schema-perception";
import type { MentionAssessment, RunMentionAssessments } from "@workspace/lib/mentions";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { LookbackPeriod } from "@/lib/lookback";
import { getBrandSentimentFn, getCompetitiveLandscapeFn, getShareOfVoiceFn } from "@/server/analysis";
import {
	getBrandAnalytics,
	getBrandCitationUrls,
	getBrandPromptPerformance,
	getBrandQueryFanout,
} from "@/server/analytics-core";
import { getCitationsFn } from "@/server/citations";
import { getDashboardSummaryFn } from "@/server/dashboard";
import { resolveFilteredPrompts } from "@/server/prompt-resolution";
import { getPromptsSummaryFn } from "@/server/prompts";
import { getQueryFanoutFn } from "@/server/query-fanout";
import { getResponseSentimentCountsFn, searchResponsesFn } from "@/server/responses";
import { getBatchChartDataFn, getFilteredVisibilityFn } from "@/server/visibility";
import {
	createBrand,
	createCitation,
	createCompetitor,
	createPrompt,
	createRun,
	deleteBrand,
	rebuildRollups,
} from "@/test/integration/stats-fixtures";

// Server functions need TanStack Start's request context; this runs their handlers directly instead.
vi.mock("@tanstack/react-start", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-start")>()),
	createServerFn: () => {
		let schema: { parse: (input: unknown) => unknown } | undefined;
		const builder = {
			validator(next: typeof schema) {
				schema = next;
				return builder;
			},
			handler(fn: (ctx: { data: unknown }) => unknown) {
				return ({ data }: { data: unknown }) => fn({ data: schema ? schema.parse(data) : data });
			},
		};
		return builder;
	},
}));
vi.mock("@/lib/auth/helpers", () => ({ requireBrandSession: async () => {} }));

const lookback: LookbackPeriod = "2026-03-01..2026-03-03";
const window = { from: "2026-03-01", to: "2026-03-03", timezone: "UTC" };

const judged = (sentiment: "positive" | "negative", position: number): MentionAssessment => ({
	mentioned: true,
	probability: 0.99,
	sentiment,
	sentimentProbabilities: { [sentiment]: 0.95 },
	passage: { start: 0, end: 10 },
	firstMention: 0,
	position,
});

const assessments = (
	brand: MentionAssessment | undefined,
	competitors: Record<string, MentionAssessment>,
): RunMentionAssessments => ({
	brand,
	competitors,
	judged: { brand: "acme", competitors: Object.fromEntries(Object.keys(competitors).map((name) => [name, "globex"])) },
});

let brandId: string;
let tracked: string;
let perception: string;

/** Every surface perception prompts must leave alone, read the way the app and the API read them. */
async function headline() {
	const scope = { brandId, lookback, timezone: "UTC" };
	return {
		dashboard: await getDashboardSummaryFn({ data: scope }),
		chart: await getBatchChartDataFn({ data: scope }),
		visibility: await getFilteredVisibilityFn({ data: scope }),
		shareOfVoice: await getShareOfVoiceFn({ data: scope }),
		landscape: await getCompetitiveLandscapeFn({ data: scope }),
		sentiment: await getBrandSentimentFn({ data: scope }),
		promptList: await getPromptsSummaryFn({ data: scope }),
		responses: await searchResponsesFn({ data: scope }),
		responseCounts: await getResponseSentimentCountsFn({ data: scope }),
		apiAnalytics: await getBrandAnalytics(brandId, window),
		apiPromptPerformance: await getBrandPromptPerformance(brandId, window),
		digestPrompts: await resolveFilteredPrompts(brandId, {}),
	};
}

/** Every surface perception prompts must reach. */
async function evidence() {
	const scope = { brandId, lookback, timezone: "UTC" };
	return {
		citationsPage: await getCitationsFn({ data: { brandId, lookback } }),
		fanoutPage: await getQueryFanoutFn({ data: scope }),
		apiCitations: await getBrandCitationUrls(brandId, window, {}, { limit: 100, offset: 0 }),
		apiFanout: await getBrandQueryFanout(brandId, window),
		evidencePromptList: await getPromptsSummaryFn({ data: { ...scope, includePerception: true } }),
		pickedResponses: await searchResponsesFn({ data: { ...scope, prompts: perception } }),
	};
}

let before: { headline: Awaited<ReturnType<typeof headline>>; evidence: Awaited<ReturnType<typeof evidence>> };
let unmarked: typeof before;
let marked: typeof before;

beforeAll(async () => {
	brandId = await createBrand({ name: "Acme", website: "https://acme.example" });
	await createCompetitor(brandId, "Globex", ["globex.example"]);
	tracked = await createPrompt(brandId, { value: "best crm for startups", tags: ["crm"] });

	const r1 = await createRun(brandId, tracked, {
		at: "2026-03-01T10:00:00Z",
		brandMentioned: true,
		competitors: ["Globex"],
		text: "Acme first, then Globex.",
		webQueries: ["best crm 2026"],
		assessments: assessments(judged("positive", 1), { Globex: judged("positive", 2) }),
	});
	await createCitation(r1, "https://review.example/best");
	const r2 = await createRun(brandId, tracked, {
		at: "2026-03-02T10:00:00Z",
		brandMentioned: true,
		text: "Acme is the pick.",
		webQueries: ["crm comparison"],
		assessments: assessments(judged("positive", 1), {}),
	});
	await createCitation(r2, "https://acme.example/pricing");
	await rebuildRollups(brandId);
	before = { headline: await headline(), evidence: await evidence() };

	// The same brand gains a prompt whose answers would move every headline number: Globex
	// first, Acme second and negative, new sources and new sub-queries.
	perception = await createPrompt(brandId, { value: "what is acme known for" });
	for (const at of ["2026-03-01T12:00:00Z", "2026-03-03T12:00:00Z"]) {
		const run = await createRun(brandId, perception, {
			at,
			brandMentioned: true,
			competitors: ["Globex"],
			text: "Globex leads; Acme is known for steep pricing.",
			webQueries: ["acme reputation"],
			assessments: assessments(judged("negative", 2), { Globex: judged("positive", 1) }),
		});
		await createCitation(run, "https://perception.example/acme");
	}
	await rebuildRollups(brandId);
	unmarked = { headline: await headline(), evidence: await evidence() };

	await db.insert(perceptionPrompts).values({ promptId: perception, class: "association" });
	marked = { headline: await headline(), evidence: await evidence() };
});

afterAll(async () => {
	await deleteBrand(brandId);
});

const headlineSurfaces = [
	"dashboard",
	"chart",
	"visibility",
	"shareOfVoice",
	"landscape",
	"sentiment",
	"promptList",
	"responses",
	"responseCounts",
	"apiAnalytics",
	"apiPromptPerformance",
	"digestPrompts",
] as const;

const evidenceSurfaces = [
	"citationsPage",
	"fanoutPage",
	"apiCitations",
	"apiFanout",
	"evidencePromptList",
	"pickedResponses",
] as const;

describe("perception prompts and headline metrics", () => {
	it.each(headlineSurfaces)("an unmarked prompt with these runs would move %s", (surface) => {
		expect(unmarked.headline[surface]).not.toEqual(before.headline[surface]);
	});

	it.each(headlineSurfaces)("marking it as perception leaves %s exactly as it was without it", (surface) => {
		expect(marked.headline[surface]).toEqual(before.headline[surface]);
	});
});

describe("perception prompts and the evidence surfaces", () => {
	it.each(evidenceSurfaces)("an unmarked prompt with these runs adds to %s", (surface) => {
		expect(unmarked.evidence[surface]).not.toEqual(before.evidence[surface]);
	});

	it.each(evidenceSurfaces)("marking it as perception keeps it in %s", (surface) => {
		expect(marked.evidence[surface]).toEqual(unmarked.evidence[surface]);
	});

	it("shows the perception answers in Responses once the prompt is picked", () => {
		expect(marked.evidence.pickedResponses.matches).toHaveLength(2);
		expect(marked.evidence.pickedResponses.matches.every((match) => match.promptId === perception)).toBe(true);
	});
});

describe("removing the marker", () => {
	it("returns the prompt to the headline metrics", async () => {
		await db.delete(perceptionPrompts).where(eq(perceptionPrompts.promptId, perception));
		expect(await headline()).toEqual(unmarked.headline);
	});
});
