import type { DbConnection } from "@workspace/lib/db/db-connection";
import { perceptionJevCalls } from "@workspace/lib/db/schema-perception";
import { sql } from "drizzle-orm";

/**
 * The most Jev calls the perception job makes for one organization in a UTC day. It bounds a runaway
 * loop, not a budget: at 24 perception prompts a brand needs about 140 calls a day, and 2,000 calls
 * cost well under a dollar.
 */
export const DAILY_JEV_CALL_CEILING = 2_000;

/**
 * Counts one call against the organization's ceiling for today, and says whether it may be made.
 * One statement raises the count only while it is below the ceiling, so two workers can't both take
 * the last slot. Every call is counted, a retry of a shortened answer included.
 */
export async function reserveJevCall(
	db: DbConnection,
	organizationId: string,
	ceiling = DAILY_JEV_CALL_CEILING,
): Promise<boolean> {
	const reserved = await db
		.insert(perceptionJevCalls)
		.values({ organizationId, day: sql`(now() AT TIME ZONE 'UTC')::date`, calls: 1 })
		.onConflictDoUpdate({
			target: [perceptionJevCalls.organizationId, perceptionJevCalls.day],
			set: { calls: sql`${perceptionJevCalls.calls} + 1` },
			setWhere: sql`${perceptionJevCalls.calls} < ${ceiling}`,
		})
		.returning({ calls: perceptionJevCalls.calls });
	return reserved.length > 0;
}
