/**
 * The fact readout (SPEC §5.6, §11.4): coverage per fact as the headline, each contradiction as
 * its own alert, and grounding beside both. Read from verdicts, one per answer and fact: the latest,
 * so a judge-version change never counts an answer twice. Days are UTC, like every perception figure.
 *
 * Takes a brand id the caller has already authorized, and scopes every read to it.
 */
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { DAILY_JEV_CALL_CEILING } from "@workspace/lib/perception/limits";
import { sql } from "drizzle-orm";

/** Alerts listed at most; the count says how many there are in all. */
export const MAX_ALERTS = 50;

export interface ReadoutFilters {
	/** Inclusive UTC days; null for no bound. */
	from: string | null;
	to: string | null;
	model?: string;
	tags?: string[];
}

export interface Grounding {
	/** Answers that cited any source. */
	cited: number;
	/** Answers that cited the fact's own source page, when it has one. */
	citedSource: number;
	/** Answers that cited a page on the brand's own site. */
	citedSite: number;
}

export interface FactCoverage {
	factId: string;
	statement: string;
	validFrom: string;
	validTo: string | null;
	sourceUrl: string | null;
	/** Answers judged against this fact: the denominator of every figure in the row. */
	answers: number;
	stated: number;
	unclear: number;
	absent: number;
	contradicted: number;
	grounding: Grounding;
}

export interface ContradictionAlert {
	verdictId: string;
	factId: string;
	statement: string;
	sourceUrl: string | null;
	sourceReadAt: string | null;
	passage: string | null;
	model: string;
	/** When the answer was given. */
	answeredAt: string;
	promptId: string;
	prompt: string;
	confidence: number | null;
	cited: boolean;
	citedSource: boolean;
	citedSite: boolean;
}

export interface FactReadout {
	facts: FactCoverage[];
	alerts: ContradictionAlert[];
	alertCount: number;
	/** The brand's organization has used today's Jev calls; unjudged answers wait for the next UTC day. */
	ceilingReached: boolean;
}

/** Compares URLs as pages: no scheme, "www.", query, fragment or trailing slash, any case. */
const pageKey = (column: unknown) =>
	sql`lower(regexp_replace(regexp_replace(regexp_replace(${column}, '^https?://(www\\.)?', ''), '[?#].*$', ''), '/+$', ''))`;

/** Verdicts in scope, the latest per answer and fact, each with what its answer cited. */
function judged(brandId: string, filters: ReadoutFilters) {
	const day = sql`(r.created_at AT TIME ZONE 'UTC')::date`;
	return sql`
		WITH site AS (
			SELECT lower(regexp_replace(regexp_replace(d, '^https?://(www\\.)?', ''), '/.*$', '')) AS host
			FROM brands b, unnest(array_prepend(b.website, b.additional_domains)) AS d
			WHERE b.id = ${brandId}
		),
		latest AS (
			SELECT DISTINCT ON (v.run_id, v.fact_id)
				v.id, v.run_id, v.fact_id, v.verdict, v.passage, v.confidence,
				r.model, r.created_at, r.prompt_id, p.value AS prompt
			FROM perception_verdicts v
			JOIN prompt_runs r ON r.id = v.run_id
			JOIN prompts p ON p.id = r.prompt_id
			WHERE v.kind = 'fact'
				AND r.brand_id = ${brandId}
				${filters.from ? sql`AND ${day} >= ${filters.from}::date` : sql``}
				${filters.to ? sql`AND ${day} <= ${filters.to}::date` : sql``}
				${filters.model ? sql`AND r.model = ${filters.model}` : sql``}
				${
					filters.tags?.length
						? sql`AND p.tags && ARRAY[${sql.join(
								filters.tags.map((tag) => sql`${tag}`),
								sql`, `,
							)}]::text[]`
						: sql``
				}
			ORDER BY v.run_id, v.fact_id, v.created_at DESC
		)
		SELECT
			l.*, f.statement, f.valid_from::text AS valid_from, f.valid_to::text AS valid_to,
			f.source_url, f.source_read_at,
			EXISTS (SELECT 1 FROM citations c WHERE c.prompt_run_id = l.run_id) AS cited,
			(f.source_url IS NOT NULL AND EXISTS (
				SELECT 1 FROM citations c WHERE c.prompt_run_id = l.run_id AND ${pageKey(sql`c.url`)} = ${pageKey(sql`f.source_url`)}
			)) AS cited_source,
			EXISTS (
				SELECT 1 FROM citations c, site s WHERE c.prompt_run_id = l.run_id
					AND (lower(regexp_replace(c.domain, '^www\\.', '')) = s.host OR lower(c.domain) LIKE '%.' || s.host)
			) AS cited_site
		FROM latest l
		JOIN brand_facts f ON f.id = l.fact_id AND f.brand_id = ${brandId}
	`;
}

interface Row extends Record<string, unknown> {
	id: string;
	run_id: string;
	fact_id: string;
	verdict: string;
	passage: string | null;
	confidence: number | null;
	model: string;
	created_at: Date | string;
	prompt_id: string;
	prompt: string;
	statement: string;
	valid_from: string;
	valid_to: string | null;
	source_url: string | null;
	source_read_at: Date | string | null;
	cited: boolean;
	cited_source: boolean;
	cited_site: boolean;
}

const iso = (value: Date | string) => (value instanceof Date ? value : new Date(value)).toISOString();

const VERDICT_FIELD: Record<string, "stated" | "unclear" | "absent" | "contradicted"> = {
	supports: "stated",
	unclear: "unclear",
	not_mentioned: "absent",
	contradicts: "contradicted",
};

/** One row per fact, counting each answer's verdict and what it cited. */
function coverage(rows: Row[]): FactCoverage[] {
	const byFact = new Map<string, FactCoverage>();
	for (const row of rows) {
		const fact = byFact.get(row.fact_id) ?? {
			factId: row.fact_id,
			statement: row.statement,
			validFrom: row.valid_from,
			validTo: row.valid_to,
			sourceUrl: row.source_url,
			answers: 0,
			stated: 0,
			unclear: 0,
			absent: 0,
			contradicted: 0,
			grounding: { cited: 0, citedSource: 0, citedSite: 0 },
		};
		byFact.set(row.fact_id, fact);
		fact.answers++;
		const field = VERDICT_FIELD[row.verdict];
		if (field) fact[field]++;
		fact.grounding.cited += Number(row.cited);
		fact.grounding.citedSource += Number(row.cited_source);
		fact.grounding.citedSite += Number(row.cited_site);
	}
	return [...byFact.values()].sort((a, b) => a.statement.localeCompare(b.statement));
}

function alert(row: Row): ContradictionAlert {
	return {
		verdictId: row.id,
		factId: row.fact_id,
		statement: row.statement,
		sourceUrl: row.source_url,
		sourceReadAt: row.source_read_at ? iso(row.source_read_at) : null,
		passage: row.passage,
		model: row.model,
		answeredAt: iso(row.created_at),
		promptId: row.prompt_id,
		prompt: row.prompt,
		confidence: row.confidence === null ? null : Number(row.confidence),
		cited: row.cited,
		citedSource: row.cited_source,
		citedSite: row.cited_site,
	};
}

async function ceilingReached(conn: DbConnection, brandId: string): Promise<boolean> {
	const result = await conn.execute<{ reached: boolean }>(sql`
		SELECT c.calls >= ${DAILY_JEV_CALL_CEILING} AS reached
		FROM brands b
		JOIN perception_jev_calls c ON c.organization_id = b.organization_id AND c.day = (now() AT TIME ZONE 'UTC')::date
		WHERE b.id = ${brandId}`);
	const rows = Array.isArray(result) ? result : (result as { rows: { reached: boolean }[] }).rows;
	return rows[0]?.reached === true;
}

export async function getFactReadout(
	conn: DbConnection,
	brandId: string,
	filters: ReadoutFilters,
): Promise<FactReadout> {
	const [result, paused] = await Promise.all([
		conn.execute<Row>(judged(brandId, filters)),
		ceilingReached(conn, brandId),
	]);
	const rows = (Array.isArray(result) ? result : (result as { rows: Row[] }).rows) as Row[];
	const contradictions = rows
		.filter((row) => row.verdict === "contradicts")
		.sort((a, b) => iso(b.created_at).localeCompare(iso(a.created_at)));
	return {
		facts: coverage(rows),
		alertCount: contradictions.length,
		ceilingReached: paused,
		alerts: contradictions.slice(0, MAX_ALERTS).map(alert),
	};
}
