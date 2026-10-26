/**
 * Market prominence (SPEC §5.3): for each attribute's market prompt, how often each tracked brand is
 * named and how early. Read per answer from `run_mentions`, never from rollups, so a change to the
 * competitor set can be recomputed rather than baked in.
 *
 *   prominence(subject, attribute) = 100 × mean over judged answers of (mentioned ? 1 / position : 0)
 *
 * `position` is elmo's: 1 for the tracked company an answer names first, by where it first appears in
 * the text, 2 for the next, and so on, over the companies the judge counted as mentioned. Only tracked
 * companies are ranked, so a brand's position depends on which competitors are tracked: every answer is
 * grouped by the competitor set it was judged against, and figures are only combined within one set.
 *
 * Every function takes the brand id the caller has already authorized, and scopes every read to it.
 */
import { createHash } from "node:crypto";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { brands, citations, promptRuns, runMentions } from "@workspace/lib/db/schema";
import { perceptionAttributes, perceptionPrompts } from "@workspace/lib/db/schema-perception";
import type { RunMentionAssessments } from "@workspace/lib/mentions";
import { and, countDistinct, desc, eq, gte, lt, sql } from "drizzle-orm";

export interface ProminenceCell {
	/** Judged answers to this attribute's market prompts in the period, under this competitor set. */
	answers: number;
	/** Answers that name the subject. */
	mentioned: number;
	/** Sum of the subject's position over the answers that name it and rank it. */
	positionSum: number;
	positioned: number;
	/** 0–100, by the formula above; null when there are no answers. */
	prominence: number | null;
}

export interface ProminenceRow {
	attributeKey: string;
	label: string;
	retired: boolean;
	/** Keyed by subject: the brand's name, then each competitor's. */
	cells: Record<string, ProminenceCell>;
}

export interface MarketProminence {
	/** The competitor set the figures are measured against: the newest set any answer was judged under. */
	competitorSet: { fingerprint: string; competitors: string[] } | null;
	/** Judged answers left out because they were judged under an earlier competitor set. */
	otherSetAnswers: number;
	brand: string;
	rows: ProminenceRow[];
}

/** A stable short id for a set of competitor names. */
export function competitorSetFingerprint(names: string[]): string {
	return createHash("sha256")
		.update(JSON.stringify([...names].sort()))
		.digest("hex")
		.slice(0, 12);
}

const emptyCell = (): ProminenceCell => ({ answers: 0, mentioned: 0, positionSum: 0, positioned: 0, prominence: null });

export async function marketProminence(
	conn: DbConnection,
	brandId: string,
	filters: { from?: Date; to?: Date; model?: string } = {},
): Promise<MarketProminence> {
	const [brand] = await conn.select({ name: brands.name }).from(brands).where(eq(brands.id, brandId));
	const attributes = await conn
		.select({
			key: perceptionAttributes.key,
			label: perceptionAttributes.label,
			retiredAt: perceptionAttributes.retiredAt,
		})
		.from(perceptionAttributes)
		.where(eq(perceptionAttributes.brandId, brandId));
	const runs = await conn
		.select({
			attributeKey: perceptionPrompts.attributeKey,
			createdAt: promptRuns.createdAt,
			assessments: runMentions.assessments,
		})
		.from(promptRuns)
		.innerJoin(
			perceptionPrompts,
			and(eq(perceptionPrompts.promptId, promptRuns.promptId), eq(perceptionPrompts.class, "market")),
		)
		// Unjudged answers have no mentions yet: they count once the judge has read them.
		.innerJoin(runMentions, eq(runMentions.runId, promptRuns.id))
		.where(
			and(
				eq(promptRuns.brandId, brandId),
				filters.from ? gte(promptRuns.createdAt, filters.from) : sql`true`,
				filters.to ? lt(promptRuns.createdAt, filters.to) : sql`true`,
				filters.model ? eq(promptRuns.model, filters.model) : sql`true`,
			),
		);

	const judged = runs.filter(
		(run): run is typeof run & { attributeKey: string; assessments: RunMentionAssessments } =>
			run.attributeKey !== null && run.assessments !== null,
	);
	const setOf = (a: RunMentionAssessments) => Object.keys(a.judged.competitors).sort();
	const newest = [...judged].sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())[0];
	const competitors = newest ? setOf(newest.assessments) : [];
	const fingerprint = newest ? competitorSetFingerprint(competitors) : null;
	const inSet = judged.filter((run) => competitorSetFingerprint(setOf(run.assessments)) === fingerprint);

	const subjects = [brand?.name ?? "", ...competitors];
	const rows: ProminenceRow[] = attributes.map((attribute) => {
		const cells = Object.fromEntries(subjects.map((s) => [s, emptyCell()]));
		const inverseSums = Object.fromEntries(subjects.map((s) => [s, 0]));
		for (const run of inSet.filter((r) => r.attributeKey === attribute.key)) {
			subjects.forEach((subject, i) => {
				const cell = cells[subject];
				const record = i === 0 ? run.assessments.brand : run.assessments.competitors[subject];
				cell.answers++;
				if (!record?.mentioned) return;
				cell.mentioned++;
				if (!record.position) return;
				cell.positionSum += record.position;
				cell.positioned++;
				inverseSums[subject] += 1 / record.position;
			});
		}
		for (const subject of subjects) {
			const cell = cells[subject];
			cell.prominence = cell.answers ? (100 * inverseSums[subject]) / cell.answers : null;
		}
		return { attributeKey: attribute.key, label: attribute.label, retired: attribute.retiredAt !== null, cells };
	});

	return {
		competitorSet: fingerprint ? { fingerprint, competitors } : null,
		otherSetAnswers: judged.length - inSet.length,
		brand: brand?.name ?? "",
		rows,
	};
}

export interface AttributeSource {
	url: string;
	domain: string;
	title: string | null;
	/** Answers to this attribute's market prompts that cite the page. */
	citingAnswers: number;
}

export interface AttributeSources {
	attributeKey: string;
	/** Answers to the attribute's market prompts in the period, judged or not: the denominator for each source. */
	answers: number;
	sources: AttributeSource[];
}

/**
 * The pages answers cite when asked each attribute's market prompt, most-cited first: where the
 * market's view of the attribute comes from. Counts answers that cite a page, not citations, so one
 * answer citing a page twice counts once.
 */
export async function attributeSources(
	conn: DbConnection,
	brandId: string,
	filters: { from?: Date; to?: Date; model?: string } = {},
	limit = 5,
): Promise<AttributeSources[]> {
	const inRange = and(
		eq(promptRuns.brandId, brandId),
		filters.from ? gte(promptRuns.createdAt, filters.from) : sql`true`,
		filters.to ? lt(promptRuns.createdAt, filters.to) : sql`true`,
		filters.model ? eq(promptRuns.model, filters.model) : sql`true`,
	);
	const market = and(eq(perceptionPrompts.promptId, promptRuns.promptId), eq(perceptionPrompts.class, "market"));
	const totals = await conn
		.select({ key: perceptionPrompts.attributeKey, answers: countDistinct(promptRuns.id) })
		.from(promptRuns)
		.innerJoin(perceptionPrompts, market)
		.where(inRange)
		.groupBy(perceptionPrompts.attributeKey);
	const cited = await conn
		.select({
			key: perceptionPrompts.attributeKey,
			url: citations.url,
			domain: citations.domain,
			title: sql<string | null>`max(${citations.title})`,
			citingAnswers: countDistinct(citations.promptRunId),
		})
		.from(citations)
		.innerJoin(promptRuns, eq(promptRuns.id, citations.promptRunId))
		.innerJoin(perceptionPrompts, market)
		.where(and(inRange, eq(citations.brandId, brandId)))
		.groupBy(perceptionPrompts.attributeKey, citations.url, citations.domain)
		.orderBy(desc(countDistinct(citations.promptRunId)), citations.url);
	return totals
		.filter((t): t is typeof t & { key: string } => t.key !== null)
		.map((t) => ({
			attributeKey: t.key,
			answers: t.answers,
			sources: cited
				.filter((c) => c.key === t.key)
				.slice(0, limit)
				.map(({ key: _, ...source }) => source),
		}));
}
