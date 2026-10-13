/**
 * No session, Request or auth: a caller passes a brand it has already decided
 * the requester may see, so the dashboard and `/api/v1` cannot compute
 * different numbers from the same data.
 */

import { getModelMeta } from "@workspace/config/models";
import { getDeploymentFeatures } from "@workspace/deployment";
import { extractDomain, normalizeUrl } from "@workspace/lib/citations/domain-categories";
import { classifyUrl as classifyUrlShared } from "@workspace/lib/citations/domain-lists";
import { rollUpCitationDomains, rollUpCitationUrls } from "@workspace/lib/citations/rollup";
import { db } from "@workspace/lib/db/db";
import { brands, competitors } from "@workspace/lib/db/schema";
import { subjectFingerprint } from "@workspace/lib/enrichment";
import { SENTIMENT_ANALYZER_VERSION, type Stance, sentimentAvailable } from "@workspace/lib/enrichment/sentiment";
import { loadBrandSubjects } from "@workspace/lib/enrichment/write";
import { getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";
import { eq } from "drizzle-orm";
import { generateDateRange } from "@/lib/chart-utils";
import { computeFanoutAnalysis, type FanoutAnalysis, type FanoutLimitOverrides } from "@/lib/fanout-analysis";
import {
	getBrandMentionRateByModel,
	getBrandMentionTotals,
	getCitationDomainPromptCounts,
	getCitationsCountByModel,
	getCitationsTotalCount,
	getCitationUrlStats,
	getFanoutBreakdown,
	getFanoutModelTotals,
	getFanoutPromptTotals,
	getMentionProminence,
	getPerPromptDailyCompetitorMentions,
	getPerPromptDailyMentions,
	getPromptsFirstEvaluatedAt,
	getPromptsSummary,
	getStanceSummary,
	getVisibilityDailyAggregate,
	isCalendarDay,
} from "@/lib/postgres-read";
import { computeShareOfVoice, shareOfVoiceLeaderboardLVCF, shareOfVoiceTimeSeriesLVCF } from "@/lib/visibility-stats";
import { resolveFilteredPrompts } from "@/server/prompt-resolution";

export interface AnalyticsWindow {
	/** Either calendar days (`YYYY-MM-DD`, read in `timezone`, `to` inclusive) or
	 * ISO instants (`to` exclusive). */
	from: string;
	to: string;
	timezone: string;
}

/**
 * Calendar days are read as midnight UTC here but in the caller's `timezone` by
 * `postgres-read`, so for those the bounds can sit a zone offset from the rows
 * the queries returned. That only matters where the bounds become a *window*,
 * and only instants reach the one below; share of voice turns these into UTC day
 * labels, which a calendar day survives. Mirror `postgres-read` here before a
 * calendar-day caller needs a window rather than a label.
 */
function windowInstants(window: AnalyticsWindow): { start: Date; end: Date } {
	const start = new Date(isCalendarDay(window.from) ? `${window.from}T00:00:00Z` : window.from);
	const end = isCalendarDay(window.to)
		? new Date(new Date(`${window.to}T00:00:00Z`).getTime() + 86_400_000)
		: new Date(window.to);
	return { start, end };
}

export interface AnalyticsFilters {
	model?: string;
	tags?: string;
	search?: string;
}

interface VisibilityPoint {
	date: string;
	visibility: number | null;
}

export interface BrandVisibility {
	currentVisibility: number | null;
	totalRuns: number;
	totalPrompts: number;
	totalCitations: number;
	series: VisibilityPoint[];
}

async function resolveScope(brandId: string, filters: AnalyticsFilters) {
	const resolved = await resolveFilteredPrompts(brandId, { tags: filters.tags, search: filters.search });
	return {
		promptIds: resolved.map((prompt) => prompt.id),
		brandedPromptIds: resolved
			.filter((prompt) => getEffectiveBrandedStatus(prompt.systemTags, prompt.tags).isBranded)
			.map((prompt) => prompt.id),
		prompts: resolved,
	};
}

/**
 * The series carries the last value forward, so a gap in a prompt's schedule
 * doesn't read as a dip. "Current" is the last plotted point, not the average.
 */
export async function getBrandVisibility(
	brandId: string,
	window: AnalyticsWindow,
	filters: AnalyticsFilters = {},
): Promise<BrandVisibility> {
	const { promptIds, brandedPromptIds } = await resolveScope(brandId, filters);
	if (promptIds.length === 0) {
		return { currentVisibility: null, totalRuns: 0, totalPrompts: 0, totalCitations: 0, series: [] };
	}

	const { from, to, timezone } = window;
	const [daily, totalCitations] = await Promise.all([
		getVisibilityDailyAggregate(brandId, from, to, timezone, promptIds, brandedPromptIds, filters.model),
		getCitationsTotalCount(brandId, from, to, timezone, promptIds, filters.model),
	]);

	let totalRuns = 0;
	const series: VisibilityPoint[] = daily.map((row) => {
		totalRuns += row.actual_branded_runs + row.actual_nonbranded_runs;
		const plotted = row.lvcf_branded_runs + row.lvcf_nonbranded_runs;
		const mentioned = row.lvcf_branded_mentioned + row.lvcf_nonbranded_mentioned;
		return { date: row.date, visibility: plotted === 0 ? null : mentioned / plotted };
	});

	let currentVisibility: number | null = null;
	for (let i = series.length - 1; i >= 0; i--) {
		if (series[i].visibility != null) {
			currentVisibility = series[i].visibility;
			break;
		}
	}

	return { currentVisibility, totalRuns, totalPrompts: promptIds.length, totalCitations, series };
}

interface ShareOfVoiceEntry {
	name: string;
	isBrand: boolean;
	mentions: number;
	prompts: number;
	share: number;
}

export interface BrandShareOfVoice {
	brandName: string;
	brandShare: number | null;
	totalRuns: number;
	entries: ShareOfVoiceEntry[];
	series: { date: string; share: number | null }[];
}

/** Standings carry each prompt's latest counts forward, so the headline and the
 * trend's last point are the same number. */
export async function getBrandShareOfVoice(
	brandId: string,
	window: AnalyticsWindow,
	filters: AnalyticsFilters = {},
): Promise<BrandShareOfVoice> {
	const { from, to, timezone } = window;
	const [brandRow, scope] = await Promise.all([
		db.select({ name: brands.name }).from(brands).where(eq(brands.id, brandId)).limit(1),
		resolveScope(brandId, filters),
	]);
	const brandName = brandRow[0]?.name ?? "Your brand";
	if (scope.promptIds.length === 0) {
		return { brandName, brandShare: null, totalRuns: 0, entries: [], series: [] };
	}

	const bounds = windowInstants(window);
	const dateRange = generateDateRange(bounds.start, new Date(bounds.end.getTime() - 1));
	const [totals, perPromptDaily, perPromptCompetitorDaily] = await Promise.all([
		getBrandMentionTotals(brandId, from, to, timezone, scope.promptIds, filters.model),
		getPerPromptDailyMentions(brandId, from, to, timezone, scope.promptIds, filters.model),
		getPerPromptDailyCompetitorMentions(brandId, from, to, timezone, scope.promptIds, filters.model),
	]);

	const standings = shareOfVoiceLeaderboardLVCF(
		perPromptDaily.map((row) => ({ promptId: row.prompt_id, date: String(row.date), brand: row.brand_mentions })),
		perPromptCompetitorDaily.map((row) => ({
			promptId: row.prompt_id,
			date: String(row.date),
			competitor: row.competitor,
			mentions: row.mentions,
		})),
		dateRange,
	);

	const promptsByName = new Map(standings.competitors.map((c) => [c.name, c.prompts]));
	const { entries, brandShare } = computeShareOfVoice(
		{ name: brandName, mentions: standings.brandMentions },
		standings.competitors.map((c) => ({ name: c.name, mentions: c.mentions })),
	);

	// Off this row rather than the per-competitor query, which counts mention
	// instances and would not agree with it.
	const series = shareOfVoiceTimeSeriesLVCF(
		perPromptDaily.map((row) => ({
			promptId: row.prompt_id,
			date: String(row.date),
			brandMentions: row.brand_mentions,
			competitorMentions: row.competitor_mentions,
		})),
		dateRange,
	);

	// Exact ratios: each edge rounds once, on the way out.
	return {
		brandName,
		brandShare,
		totalRuns: Number(totals?.total_runs ?? 0),
		entries: entries.map((entry) => ({
			name: entry.name,
			isBrand: entry.isBrand,
			mentions: entry.mentions,
			prompts: entry.isBrand ? standings.brandPrompts : (promptsByName.get(entry.name) ?? 0),
			share: entry.share,
		})),
		series,
	};
}

export interface ModelVisibility {
	model: string;
	label: string;
	runs: number;
	brandMentions: number;
	visibility: number | null;
	citations: number;
}

async function getBrandModelBreakdown(
	brandId: string,
	window: AnalyticsWindow,
	filters: AnalyticsFilters = {},
): Promise<ModelVisibility[]> {
	const { promptIds } = await resolveScope(brandId, filters);
	if (promptIds.length === 0) return [];
	const { from, to, timezone } = window;

	const [rows, citationRows] = await Promise.all([
		getBrandMentionRateByModel(brandId, from, to, timezone, promptIds, filters.model),
		getCitationsCountByModel(brandId, from, to, timezone, promptIds),
	]);
	const citationsByModel = new Map(citationRows.map((row) => [row.model, row.count]));

	return rows.map((row) => {
		const runs = Number(row.runs);
		const mentions = Number(row.brand_mentioned_count);
		return {
			model: row.model,
			label: getModelMeta(row.model).label,
			runs,
			brandMentions: mentions,
			visibility: runs === 0 ? null : mentions / runs,
			citations: citationsByModel.get(row.model) ?? 0,
		};
	});
}

async function citationContext(brandId: string) {
	const [brandRow, competitorRows] = await Promise.all([
		db.select().from(brands).where(eq(brands.id, brandId)).limit(1),
		db.select().from(competitors).where(eq(competitors.brandId, brandId)),
	]);
	const brand = brandRow[0];
	const brandDomains = new Set(
		[extractDomain(brand?.website ?? ""), ...(brand?.additionalDomains ?? []).map(extractDomain)].filter(Boolean),
	);
	const competitorDomains = new Set(competitorRows.flatMap((row) => row.domains.map(extractDomain)).filter(Boolean));
	return { brandDomains, competitorDomains };
}

export async function getBrandCitations(brandId: string, window: AnalyticsWindow, filters: AnalyticsFilters = {}) {
	const { promptIds } = await resolveScope(brandId, filters);
	const { from, to, timezone } = window;
	if (promptIds.length === 0) {
		return { urls: [], domains: [], totals: { citations: 0, uniqueDomains: 0, uniqueUrls: 0 } };
	}

	// Instants, so it lands where this window begins rather than rounding
	// outward to whole days.
	const { start, end } = windowInstants(window);
	const previousStart = new Date(start.getTime() - (end.getTime() - start.getTime())).toISOString();
	const previousEnd = start.toISOString();

	const [{ brandDomains, competitorDomains }, current, previous, promptsByDomain] = await Promise.all([
		citationContext(brandId),
		getCitationUrlStats(brandId, from, to, timezone, promptIds, filters.model),
		getCitationUrlStats(brandId, previousStart, previousEnd, timezone, promptIds, filters.model),
		getCitationDomainPromptCounts(brandId, from, to, timezone, promptIds, filters.model),
	]);

	const classify = (domain: string, url: string, title?: string | null) =>
		classifyUrlShared(domain, url, title, brandDomains, competitorDomains);

	const previousUrls = new Set(previous.map((stat) => normalizeUrl(stat.url)));
	const previousDomainCounts = new Map<string, number>();
	for (const stat of previous) {
		previousDomainCounts.set(stat.domain, (previousDomainCounts.get(stat.domain) ?? 0) + Number(stat.count));
	}

	// A domain's URLs can be cited by disjoint prompts, so its distinct count
	// cannot be the largest of its parts the way a single URL's can.
	const promptCounts = new Map<string, number>();
	for (const stat of current) {
		const url = normalizeUrl(stat.url);
		promptCounts.set(url, Math.max(promptCounts.get(url) ?? 0, Number(stat.prompt_count)));
	}

	const rolled = rollUpCitationUrls(current, classify);
	const totalCitations = rolled.reduce((sum, row) => sum + row.count, 0);

	const urls = rolled.map((row) => ({
		url: row.url,
		domain: row.domain,
		title: row.title ?? null,
		category: row.category,
		pageType: row.pageType,
		count: row.count,
		promptCount: promptCounts.get(row.url) ?? 0,
		isNew: !previousUrls.has(row.url),
	}));

	const domains = rollUpCitationDomains(rolled).map((row) => {
		const previousCount = previousDomainCounts.get(row.domain) ?? 0;
		return {
			domain: row.domain,
			category: row.category,
			count: row.count,
			share: totalCitations === 0 ? 0 : row.count / totalCitations,
			promptCount: promptsByDomain.get(row.domain) ?? 0,
			previousCount,
			changeFactor: previousCount > 0 ? row.count / previousCount : null,
		};
	});

	return {
		urls,
		domains,
		totals: { citations: totalCitations, uniqueDomains: domains.length, uniqueUrls: urls.length },
	};
}

export async function getBrandQueryFanout(
	brandId: string,
	window: AnalyticsWindow,
	filters: AnalyticsFilters = {},
	options: {
		promptId?: string;
		uncapped?: boolean;
	} = {},
): Promise<FanoutAnalysis & { brandName: string }> {
	const { from, to, timezone } = window;
	const [brandRow, scope] = await Promise.all([
		db.select({ name: brands.name }).from(brands).where(eq(brands.id, brandId)).limit(1),
		resolveScope(brandId, filters),
	]);
	const brandName = brandRow[0]?.name ?? "Your brand";

	const promptIds = options.promptId ? scope.promptIds.filter((id) => id === options.promptId) : scope.promptIds;
	if (promptIds.length === 0) return { brandName, ...emptyFanout() };

	const [breakdown, modelTotals, promptTotals] = await Promise.all([
		getFanoutBreakdown(brandId, from, to, timezone, promptIds, filters.model),
		getFanoutModelTotals(brandId, from, to, timezone, promptIds, filters.model),
		getFanoutPromptTotals(brandId, from, to, timezone, promptIds, filters.model),
	]);

	const promptValues = new Map(
		scope.prompts.filter((prompt) => promptIds.includes(prompt.id)).map((prompt) => [prompt.id, prompt.value]),
	);
	// Without this every byPrompt row reports zero runs and a zero average.
	const promptRuns = new Map(promptTotals.map((row) => [row.prompt_id, row.runs]));

	return {
		brandName,
		...computeFanoutAnalysis(breakdown, modelTotals, promptValues, {
			promptRuns,
			limits: fanoutLimits(options),
		}),
	};
}

/** Display caps, so a caller that pages one of these lists is not paging a
 * silently truncated one. */
function fanoutLimits(options: { promptId?: string; uncapped?: boolean }): FanoutLimitOverrides | undefined {
	if (options.uncapped) {
		return { topQueries: UNCAPPED, breadth: UNCAPPED, terms: UNCAPPED, perModelTop: UNCAPPED, variations: UNCAPPED };
	}
	if (options.promptId) return { topQueries: 2000, perModelTop: 2000, variations: 2000 };
	return undefined;
}

const UNCAPPED = Number.MAX_SAFE_INTEGER;

function emptyFanout(): FanoutAnalysis {
	return {
		totalQueries: 0,
		uniqueQueries: 0,
		fanoutRuns: 0,
		totalRuns: 0,
		avgPerExecution: 0,
		coverageRate: 0,
		topQueries: [],
		terms: [],
		wordChanges: { added: [], dropped: [], preserved: [] },
		byModel: [],
		byPrompt: [],
		topByPrompts: [],
		topByRuns: [],
	};
}

export interface PromptPerformance {
	promptId: string;
	value: string;
	tags: string[];
	totalRuns: number;
	brandMentionRate: number;
	competitorMentionRate: number;
	lastRunAt: string | null;
	firstEvaluatedAt: string | null;
}

/** Only prompts that ran appear, which is why no row carries an `enabled` flag. */
export async function getBrandPromptPerformance(
	brandId: string,
	window: AnalyticsWindow,
	filters: AnalyticsFilters = {},
): Promise<PromptPerformance[]> {
	const scope = await resolveScope(brandId, filters);
	if (scope.promptIds.length === 0) return [];
	const { from, to, timezone } = window;

	const [summary, firstEvaluated] = await Promise.all([
		getPromptsSummary(brandId, from, to, timezone, undefined, filters.model, scope.promptIds),
		getPromptsFirstEvaluatedAt(brandId, scope.promptIds),
	]);

	const statsById = new Map(summary.map((row) => [row.prompt_id, row]));
	const firstById = new Map(firstEvaluated.map((row) => [row.prompt_id, row.first_evaluated_at]));

	return scope.prompts.map((prompt) => {
		const stats = statsById.get(prompt.id);
		const first = firstById.get(prompt.id);
		return {
			promptId: prompt.id,
			value: prompt.value,
			tags: prompt.tags ?? [],
			totalRuns: Number(stats?.total_runs ?? 0),
			brandMentionRate: Number(stats?.brand_mention_rate ?? 0),
			competitorMentionRate: Number(stats?.competitor_mention_rate ?? 0),
			lastRunAt: stats?.last_run_date ? new Date(stats.last_run_date).toISOString() : null,
			firstEvaluatedAt: first ? new Date(first).toISOString() : null,
		};
	});
}

export interface SubjectProminence {
	key: string;
	kind: "brand" | "competitor";
	name: string;
	/** Analysed runs whose answer names the subject. */
	mentionedRuns: number;
	/** Of analysed runs only; null when none are analysed. */
	mentionRate: number | null;
	/**
	 * Over the runs that name the subject, not all analysed runs: 1 when answers
	 * open with it, falling toward 0 the later it first appears. Null when never
	 * mentioned. Read it with mentionRate.
	 */
	averageProminence: number | null;
	/**
	 * Over the runs that name the subject: its mean rank among the subjects each
	 * of those answers names (1 = named first). Null when never mentioned.
	 */
	averageRank: number | null;
}

export interface BrandMentionProminence {
	/** Every run in the window, and how many of them have a current analysis. */
	coverage: { runs: number; analysed: number };
	subjects: SubjectProminence[];
}

/**
 * Where answers name the brand and each competitor, from stored mention
 * analysis. Counts come from analysed runs only, so they can differ from
 * visibility and share of voice, which read prompt_runs.brand_mentioned over
 * every run. A run without a current analysis is counted in `coverage.runs`
 * and nowhere else: never as a run that didn't mention a subject.
 */
export async function getBrandMentionProminence(
	brandId: string,
	window: AnalyticsWindow,
	filters: AnalyticsFilters = {},
): Promise<BrandMentionProminence> {
	const [{ promptIds }, subjects] = await Promise.all([resolveScope(brandId, filters), loadBrandSubjects(db, brandId)]);
	if (!subjects) return { coverage: { runs: 0, analysed: 0 }, subjects: [] };

	const { from, to, timezone } = window;
	const { coverage, subjects: rows } =
		promptIds.length === 0
			? { coverage: { runs: 0, analysed: 0 }, subjects: [] }
			: await getMentionProminence(brandId, from, to, timezone, promptIds, subjectFingerprint(subjects), filters.model);
	const byKey = new Map(rows.map((row) => [row.subject_key, row]));

	const ordered = [
		...subjects.filter((subject) => subject.kind === "brand"),
		...subjects.filter((subject) => subject.kind === "competitor").sort((a, b) => a.name.localeCompare(b.name)),
	];
	return {
		coverage,
		subjects: ordered.map((subject) => {
			const row = byKey.get(subject.key);
			const mentionedRuns = row?.mentioned_runs ?? 0;
			return {
				key: subject.key,
				kind: subject.kind,
				name: subject.name,
				mentionedRuns,
				mentionRate: coverage.analysed === 0 ? null : mentionedRuns / coverage.analysed,
				averageProminence: row ? 1 - row.avg_position : null,
				averageRank: row ? row.avg_rank : null,
			};
		}),
	};
}

export type StanceCounts = Record<Stance, number>;

export interface SubjectStance {
	key: string;
	kind: "brand" | "competitor";
	name: string;
	/** Analysed runs' mentions of the subject, one per run that names it. */
	mentions: number;
	/** Of those, the ones with a judgement; every rate below is over these. */
	judged: number;
	stances: StanceCounts;
	/**
	 * (recommended − disrecommended − comparison_anchor) / judged, from −1 to 1.
	 * Null when nothing is judged.
	 */
	netStanceRate: number | null;
}

export interface RiskEvidence {
	runId: string;
	model: string;
	createdAt: string;
	stance: "disrecommended" | "comparison_anchor";
	/** The answer's own words, verbatim; null when the analyzer's quote wasn't. */
	evidence: string | null;
}

export interface RiskPrompt {
	promptId: string;
	value: string;
	/** Judged mentions of the brand in this prompt's answers. */
	judged: number;
	disrecommended: number;
	comparisonAnchor: number;
	caveated: number;
	/** The newest few distinct answers that set the brand back, newest first. */
	evidence: RiskEvidence[];
}

export interface BrandSentiment {
	/** Whether this deployment is judging new answers. Stored judgements read either way. */
	analysisEnabled: boolean;
	/** The one analyzer version every figure here comes from. */
	analyzerVersion: number;
	coverage: {
		/** Every run in the window. */
		runs: number;
		/** Runs whose answer has no text, so nothing to judge; in no denominator. */
		blank: number;
		/** Runs with answer text and a current mention analysis. */
		analysed: number;
		/** Subject mentions in analysed runs, and how many of them are judged. */
		mentions: number;
		judged: number;
	};
	subjects: SubjectStance[];
	/**
	 * Prompts whose answers disrecommend the brand or use it as the foil for a
	 * competitor, most such answers first.
	 */
	riskPrompts: RiskPrompt[];
}

const emptyStances = (): StanceCounts => ({
	recommended: 0,
	mentioned_neutral: 0,
	mentioned_caveated: 0,
	disrecommended: 0,
	comparison_anchor: 0,
});

/**
 * How answers treat the brand and each competitor, from stored stance
 * judgements of the current analyzer version only. Runs whose answer text is
 * NULL are counted in `coverage.blank` and kept out of every rate; a mention
 * not yet judged is counted in `coverage.mentions` and kept out of the stance
 * figures, never read as neutral.
 */
export async function getBrandSentiment(
	brandId: string,
	window: AnalyticsWindow,
	filters: AnalyticsFilters = {},
): Promise<BrandSentiment> {
	const [{ promptIds }, subjects] = await Promise.all([resolveScope(brandId, filters), loadBrandSubjects(db, brandId)]);
	const empty = { runs: 0, blank: 0, analysed: 0, mentions: 0, judged: 0 };
	const { from, to, timezone } = window;
	const summary =
		!subjects || promptIds.length === 0
			? { coverage: empty, subjects: [], riskPrompts: [] }
			: await getStanceSummary(
					brandId,
					from,
					to,
					timezone,
					promptIds,
					subjectFingerprint(subjects),
					SENTIMENT_ANALYZER_VERSION,
					filters.model,
				);
	const byKey = new Map(summary.subjects.map((row) => [row.subject_key, row]));
	const ordered = [
		...(subjects ?? []).filter((subject) => subject.kind === "brand"),
		...(subjects ?? []).filter((subject) => subject.kind === "competitor").sort((a, b) => a.name.localeCompare(b.name)),
	];

	return {
		analysisEnabled: sentimentAvailable(getDeploymentFeatures()),
		analyzerVersion: SENTIMENT_ANALYZER_VERSION,
		coverage: summary.coverage,
		subjects: ordered.map((subject) => {
			const row = byKey.get(subject.key);
			const stances = emptyStances();
			if (row) for (const stance of Object.keys(stances) as Stance[]) stances[stance] = row[stance];
			const judged = row?.judged ?? 0;
			return {
				key: subject.key,
				kind: subject.kind,
				name: subject.name,
				mentions: row?.mentions ?? 0,
				judged,
				stances,
				netStanceRate:
					judged === 0 ? null : (stances.recommended - stances.disrecommended - stances.comparison_anchor) / judged,
			};
		}),
		riskPrompts: summary.riskPrompts.map((row) => ({
			promptId: row.prompt_id,
			value: row.value,
			judged: row.judged,
			disrecommended: row.disrecommended,
			comparisonAnchor: row.comparison_anchor,
			caveated: row.mentioned_caveated,
			evidence: row.evidence.map((item) => ({
				runId: item.run_id,
				model: item.model,
				createdAt: new Date(item.created_at).toISOString(),
				stance: item.stance,
				evidence: item.evidence,
			})),
		})),
	};
}

/** The long lists — cited domains and URLs, sub-queries, per-prompt results —
 * are endpoints of their own. */
export async function getBrandAnalytics(brandId: string, window: AnalyticsWindow, filters: AnalyticsFilters = {}) {
	const [visibility, shareOfVoice, models, citations] = await Promise.all([
		getBrandVisibility(brandId, window, filters),
		getBrandShareOfVoice(brandId, window, filters),
		getBrandModelBreakdown(brandId, window, filters),
		getBrandCitations(brandId, window, filters),
	]);

	return {
		brandName: shareOfVoice.brandName,
		visibility: { current: visibility.currentVisibility, series: visibility.series },
		shareOfVoice: { brand: shareOfVoice.brandShare, entries: shareOfVoice.entries, series: shareOfVoice.series },
		models,
		totals: {
			runs: visibility.totalRuns,
			prompts: visibility.totalPrompts,
			citations: visibility.totalCitations,
			uniqueDomains: citations.totals.uniqueDomains,
			uniqueUrls: citations.totals.uniqueUrls,
		},
	};
}
