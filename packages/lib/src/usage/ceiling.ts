import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "../db/db";
import type { DbConnection } from "../db/db-connection";
import { usageEvents } from "../db/schema";

/** The usage_events types the scraper writes, one per provider attempt. */
export const SCRAPER_USAGE_EVENT_TYPES = ["prompt_run", "prompt_run_failed"] as const;

/**
 * Runaway protection: how many provider attempts the org has recorded in the
 * last 24h, compared against its plan-derived ceiling before spending more.
 *
 * Counts usage_events rather than prompt_runs because a retry storm writes no prompt_runs
 * rows but burns spend — counting attempts is the stronger meaning for a
 * safety ceiling.
 *
 * Only the scraper's own event types count. usage_events is shared spend
 * attribution, and other lanes (enrichment) will write to it too; their events
 * are not scraper provider attempts and must not use up the scraper's budget.
 * A lane that writes usage_events needs its own ceiling over its own types.
 * The (organization_id, event_type, created_at) index keeps the filtered
 * count cheap.
 */
export async function isOrgOverDailyCeiling(organizationId: string, ceiling: number): Promise<boolean> {
	const [row] = await db
		.select({ value: sql<number>`COUNT(*)` })
		.from(usageEvents)
		.where(
			and(
				eq(usageEvents.organizationId, organizationId),
				inArray(usageEvents.eventType, [...SCRAPER_USAGE_EVENT_TYPES]),
				gt(usageEvents.createdAt, sql`now() - interval '24 hours'`),
			),
		);
	return Number(row?.value ?? 0) >= ceiling;
}

/** The usage_events types enrichment writes: paid model calls that score stored answers. */
export const ENRICHMENT_USAGE_EVENT_TYPES = ["sentiment-analysis"] as const;

export const DEFAULT_ENRICHMENT_DAILY_CAP_USD = 2;

/**
 * The per-org enrichment spend cap, in USD over a rolling 24h, from
 * ENRICHMENT_DAILY_CAP_USD. A value that isn't a non-negative number falls back
 * to the default rather than lifting the cap.
 */
export function enrichmentDailyCapUsd(env: Record<string, string | undefined> = process.env): number {
	const raw = env.ENRICHMENT_DAILY_CAP_USD?.trim();
	if (!raw) return DEFAULT_ENRICHMENT_DAILY_CAP_USD;
	const value = Number(raw);
	if (!Number.isFinite(value) || value < 0) {
		console.error(`Ignoring invalid ENRICHMENT_DAILY_CAP_USD "${raw}"; using $${DEFAULT_ENRICHMENT_DAILY_CAP_USD}.`);
		return DEFAULT_ENRICHMENT_DAILY_CAP_USD;
	}
	return value;
}

/**
 * Whether the org's enrichment spend over the last 24h has reached `capUsd`,
 * checked before every paid enrichment call. Independent of the scraper
 * ceiling: it sums the estimated cost of enrichment events only, and scraper
 * events never count toward it, nor these toward the scraper's.
 */
export async function isOrgOverEnrichmentCeiling(
	organizationId: string,
	capUsd: number,
	conn: DbConnection = db,
): Promise<boolean> {
	const [row] = await conn
		.select({ spent: sql<string>`COALESCE(SUM(${usageEvents.estimatedCostUsd}), 0)` })
		.from(usageEvents)
		.where(
			and(
				eq(usageEvents.organizationId, organizationId),
				inArray(usageEvents.eventType, [...ENRICHMENT_USAGE_EVENT_TYPES]),
				gt(usageEvents.createdAt, sql`now() - interval '24 hours'`),
			),
		);
	return Number(row?.spent ?? 0) >= capUsd;
}
