import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "../db/db";
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
