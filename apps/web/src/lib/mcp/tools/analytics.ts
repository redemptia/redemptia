/**
 * Over `analytics-core`, the same functions the dashboard calls. None paginate,
 * because none can grow without bound; the lists that can have their own tools.
 */
import { publicRange } from "@/lib/api/analytics-range";
import { requireBrandInScope } from "@/lib/api/scope";
import type { AnalyticsFilters, AnalyticsWindow } from "@/server/analytics-core";
import {
	getBrandAnalytics,
	getBrandCitations,
	getBrandMentionProminence,
	getBrandPromptPerformance,
	getBrandQueryFanout,
	getBrandSentiment,
} from "@/server/analytics-core";
import { publishedOpportunities } from "@/server/opportunities-core";
import { requireSentimentInPlan } from "@/server/sentiment-access";
import { brandIdArg, defineTool, filtersFrom, type McpTool, windowArgs, windowFor } from "./define";

interface BrandWindow {
	brand: Awaited<ReturnType<typeof requireBrandInScope>>;
	range: AnalyticsWindow;
	filters: AnalyticsFilters;
}

function analyticsTool(tool: {
	name: string;
	title: string;
	description: string;
	run(context: BrandWindow): Promise<object>;
}): McpTool {
	return defineTool({
		...tool,
		scopes: ["read"],
		readOnly: true,
		input: { brandId: brandIdArg, ...windowArgs },
		run: async ({ auth }, args) => {
			const brand = await requireBrandInScope(auth, args.brandId);
			const range = windowFor(args);
			const context = { brand, range, filters: filtersFrom(args) };
			return { brandId: brand.id, range: publicRange(range), ...(await tool.run(context)) };
		},
	});
}

export const getAnalytics = analyticsTool({
	name: "get_analytics",
	title: "Get a brand's analytics",
	description:
		"Everything a brand's window says in one call: visibility and its daily trend, share of voice against tracked competitors, the per-model breakdown, and citation totals. The first thing to read when asked how a brand is doing. Rates are fractions of 1, not percentages.",
	run: async ({ brand, range, filters }) => getBrandAnalytics(brand.id, range, filters),
});

export const getPromptPerformance = analyticsTool({
	name: "get_prompt_performance",
	title: "Get per-prompt performance",
	description:
		"How each prompt performed over the window — which questions surface the brand and which don't. Enabled prompts only; a disabled one isn't sampled, so it has nothing to report.",
	run: async ({ brand, range, filters }) => ({ data: await getBrandPromptPerformance(brand.id, range, filters) }),
});

export const getMentionProminence = analyticsTool({
	name: "get_mention_prominence",
	title: "Get where answers name the brand and its competitors",
	description:
		"For the brand and each competitor: how many analysed answers name it, how early (prominence, 1 = the answer opens with it), and in what order among the others (rank, 1 = named first). Prominence and rank are averaged over only the answers that name the subject, so read them with mentionRate: a competitor named first in one answer out of hundreds has rank 1. Counted from analysed runs only — `coverage` says how many of the window's runs that is — so it can differ from get_analytics' visibility and share of voice, which count every run. Never read an unanalysed run as one that didn't mention a subject.",
	run: async ({ brand, range, filters }) => getBrandMentionProminence(brand.id, range, filters),
});

export const getSentiment = analyticsTool({
	name: "get_sentiment",
	title: "Get how answers treat the brand and its competitors",
	description:
		"How AI answers treat the brand and each competitor, as judged by a model: counts per stance (recommended, mentioned_neutral, mentioned_caveated, disrecommended, comparison_anchor) and netStanceRate = (recommended − disrecommended − comparison_anchor) / judged, from −1 to 1. riskPrompts lists the prompts whose answers disrecommend the brand or use it as the foil for a competitor, with the answers' own words as evidence — the place to start when asked what to fix. Every figure is over judged mentions only, from one analyzer version; an unjudged mention is not a neutral one, and runs with no answer text are left out. analysisEnabled false means new answers aren't being judged on this deployment. Refused for an organization whose plan doesn't include sentiment (Starter); get_mention_prominence is on every plan.",
	run: async ({ brand, range, filters }) => {
		await requireSentimentInPlan(brand.organizationId);
		return getBrandSentiment(brand.id, range, filters);
	},
});

export const getCitations = analyticsTool({
	name: "get_citations",
	title: "Get cited sources",
	description:
		"The pages the models cited while answering about this brand, by domain and by URL, each categorized as the brand's own, a competitor's, or editorial. The core of an AEO content plan: the editorial pages here are where the models are getting their answers.",
	run: async ({ brand, range, filters }) => {
		const { domains, urls, totals } = await getBrandCitations(brand.id, range, filters);
		return {
			totals: { citations: totals.citations, uniqueDomains: totals.uniqueDomains, uniqueUrls: totals.uniqueUrls },
			domains,
			urls,
		};
	},
});

export const getQueryFanout = analyticsTool({
	name: "get_query_fanout",
	title: "Get the searches the models ran",
	description:
		"The web searches the models actually ran while answering, and how often. These are the phrasings to optimize for — they are frequently not the prompt's own wording.",
	run: async ({ brand, range, filters }) => {
		const analysis = await getBrandQueryFanout(brand.id, range, filters, { uncapped: true });
		return {
			totalQueries: analysis.totalQueries,
			uniqueQueries: analysis.uniqueQueries,
			fanoutRuns: analysis.fanoutRuns,
			totalRuns: analysis.totalRuns,
			avgQueriesPerRun: analysis.avgPerExecution,
			coverageRate: analysis.coverageRate,
			data: analysis.topByRuns.map((entry) => ({
				query: entry.query,
				runs: entry.runs,
				promptCount: entry.prompts,
			})),
		};
	},
});

/** No window: this reads the newest stored report, whenever it was generated. */
export const getOpportunities = defineTool({
	name: "get_opportunities",
	title: "Get the latest opportunities report",
	description:
		"The most recent stored opportunities report for a brand: what to write, what to fix, and the risks Elmo found. `status` says whether there was enough data to write one.",
	scopes: ["read"],
	readOnly: true,
	input: { brandId: brandIdArg },
	run: async ({ auth }, args) => {
		const brand = await requireBrandInScope(auth, args.brandId);
		return publishedOpportunities(brand.id);
	},
});
