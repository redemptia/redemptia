/**
 * Perception over time, read from the daily rollups: fact coverage from `rollup_perception_daily` and
 * market prominence from `rollup_prominence_daily`. The readouts for "now" read answers directly; these
 * answer "what changed". A day holds one judge version (facts) or one competitor set (market), picked
 * by `pickDominant`, so a day is never a sum across versions.
 *
 * Takes a brand id the caller has already authorized, and scopes every read to it.
 */
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { sql } from "drizzle-orm";
import { newerJudgeStamp, pickDominant } from "@/lib/perception-history";

export interface HistoryFilters {
	from: string | null;
	to: string | null;
	model?: string;
}

export interface FactDay {
	day: string;
	answers: number;
	stated: number;
	unclear: number;
	absent: number;
	contradicted: number;
	stamp: string;
	/** Answers that day judged under another version, left out of the numbers above. */
	otherStampAnswers: number;
}

export interface FactHistory {
	factId: string;
	statement: string;
	validFrom: string;
	validTo: string | null;
	days: FactDay[];
	/** Days where the chosen version differs from the previous day's. */
	versionChanges: string[];
}

export interface MarketDay {
	day: string;
	answers: number;
	mentioned: number;
	positioned: number;
	positionSum: number;
	inverseSum: number;
	competitorSet: string;
	otherSetAnswers: number;
}

export interface PerceptionHistory {
	brand: string;
	/** The first day any rollup row exists for the brand, whatever the filters: where history begins. */
	factsFirstDay: string | null;
	marketFirstDay: string | null;
	facts: FactHistory[];
	attributes: { key: string; label: string }[];
	market: { versionChanges: string[]; days: MarketDay[] };
}

const rowsOf = <T>(result: unknown): T[] => (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];

const VERDICT_FIELD: Record<string, "stated" | "unclear" | "absent" | "contradicted"> = {
	supports: "stated",
	unclear: "unclear",
	not_mentioned: "absent",
	contradicts: "contradicted",
};

const dateRange = (column: ReturnType<typeof sql.raw>, filters: HistoryFilters) =>
	sql`${filters.from ? sql`AND ${column} >= ${filters.from}::date` : sql``} ${filters.to ? sql`AND ${column} <= ${filters.to}::date` : sql``}`;

async function factHistory(conn: DbConnection, brandId: string, filters: HistoryFilters): Promise<FactHistory[]> {
	const rows = rowsOf<{
		day: string;
		fact_id: string;
		statement: string;
		valid_from: string;
		valid_to: string | null;
		stamp: string;
		verdict: string;
		answers: string;
	}>(
		await conn.execute(sql`
			SELECT r.day::text AS day, f.id AS fact_id, f.statement, f.valid_from::text AS valid_from,
				f.valid_to::text AS valid_to, r.stamp, r.verdict, sum(r.answers) AS answers
			FROM rollup_perception_daily r
			JOIN brand_facts f ON f.id::text = r.ref_key AND f.brand_id = r.brand_id
			WHERE r.brand_id = ${brandId} AND r.kind = 'fact'
				${filters.model ? sql`AND r.model = ${filters.model}` : sql``}
				${dateRange(sql.raw("r.day"), filters)}
			GROUP BY r.day, f.id, f.statement, f.valid_from, f.valid_to, r.stamp, r.verdict
			ORDER BY r.day`),
	);
	const facts = new Map<string, FactHistory & { byDay: Map<string, Map<string, FactDay>> }>();
	for (const row of rows) {
		const fact = facts.get(row.fact_id) ?? {
			factId: row.fact_id,
			statement: row.statement,
			validFrom: row.valid_from,
			validTo: row.valid_to,
			days: [],
			versionChanges: [],
			byDay: new Map(),
		};
		facts.set(row.fact_id, fact);
		const stamps = fact.byDay.get(row.day) ?? new Map<string, FactDay>();
		fact.byDay.set(row.day, stamps);
		const tally = stamps.get(row.stamp) ?? {
			day: row.day,
			answers: 0,
			stated: 0,
			unclear: 0,
			absent: 0,
			contradicted: 0,
			stamp: row.stamp,
			otherStampAnswers: 0,
		};
		stamps.set(row.stamp, tally);
		const count = Number(row.answers);
		tally.answers += count;
		const field = VERDICT_FIELD[row.verdict];
		if (field) tally[field] += count;
	}
	return [...facts.values()]
		.map(({ byDay, ...fact }) => {
			for (const [day, stamps] of [...byDay].sort(([a], [b]) => a.localeCompare(b))) {
				const picked = pickDominant(stamps, newerJudgeStamp);
				if (!picked) continue;
				const previous = fact.days[fact.days.length - 1];
				if (previous && previous.stamp !== picked.key) fact.versionChanges.push(day);
				fact.days.push({ ...picked.chosen, day, otherStampAnswers: picked.otherAnswers });
			}
			return fact;
		})
		.sort((a, b) => a.statement.localeCompare(b.statement));
}

async function marketHistory(
	conn: DbConnection,
	brandId: string,
	brandName: string,
	filters: HistoryFilters & { attributeKey?: string },
): Promise<PerceptionHistory["market"]> {
	const rows = rowsOf<{
		day: string;
		fingerprint: string;
		answers: string;
		mentioned: string;
		positioned: string;
		position_sum: string;
		inverse_sum: string;
	}>(
		await conn.execute(sql`
			SELECT day::text AS day, competitor_set_fingerprint AS fingerprint, sum(answers) AS answers,
				sum(mentioned_answers) AS mentioned, sum(positioned_answers) AS positioned,
				sum(position_sum) AS position_sum, sum(inverse_position_sum) AS inverse_sum
			FROM rollup_prominence_daily
			WHERE brand_id = ${brandId} AND subject_name = ${brandName}
				${filters.model ? sql`AND model = ${filters.model}` : sql``}
				${filters.attributeKey ? sql`AND attribute_key = ${filters.attributeKey}` : sql``}
				${dateRange(sql.raw("day"), filters)}
			GROUP BY day, competitor_set_fingerprint
			ORDER BY day`),
	);
	const byDay = new Map<string, Map<string, MarketDay>>();
	for (const row of rows) {
		const sets = byDay.get(row.day) ?? new Map<string, MarketDay>();
		byDay.set(row.day, sets);
		sets.set(row.fingerprint, {
			day: row.day,
			answers: Number(row.answers),
			mentioned: Number(row.mentioned),
			positioned: Number(row.positioned),
			positionSum: Number(row.position_sum),
			inverseSum: Number(row.inverse_sum),
			competitorSet: row.fingerprint,
			otherSetAnswers: 0,
		});
	}
	const days: MarketDay[] = [];
	const versionChanges: string[] = [];
	for (const [day, sets] of byDay) {
		const picked = pickDominant(sets);
		if (!picked) continue;
		const previous = days[days.length - 1];
		if (previous && previous.competitorSet !== picked.key) versionChanges.push(day);
		days.push({ ...picked.chosen, otherSetAnswers: picked.otherAnswers });
	}
	return { days, versionChanges };
}

export async function getPerceptionHistory(
	conn: DbConnection,
	brandId: string,
	filters: HistoryFilters & { attributeKey?: string },
): Promise<PerceptionHistory> {
	const brand = rowsOf<{ name: string }>(await conn.execute(sql`SELECT name FROM brands WHERE id = ${brandId}`))[0];
	const first = rowsOf<{ facts: string | null; market: string | null }>(
		await conn.execute(sql`
			SELECT (SELECT min(day)::text FROM rollup_perception_daily WHERE brand_id = ${brandId} AND kind = 'fact') AS facts,
				(SELECT min(day)::text FROM rollup_prominence_daily WHERE brand_id = ${brandId}) AS market`),
	)[0];
	const attributes = rowsOf<{ key: string; label: string }>(
		await conn.execute(
			sql`SELECT key, label FROM perception_attributes WHERE brand_id = ${brandId} AND retired_at IS NULL ORDER BY label`,
		),
	);
	const [facts, market] = await Promise.all([
		factHistory(conn, brandId, filters),
		marketHistory(conn, brandId, brand?.name ?? "", filters),
	]);
	return {
		brand: brand?.name ?? "",
		factsFirstDay: first?.facts ?? null,
		marketFirstDay: first?.market ?? null,
		facts,
		attributes,
		market,
	};
}
