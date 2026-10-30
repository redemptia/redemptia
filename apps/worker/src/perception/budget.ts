import type { DbConnection } from "@workspace/lib/db/db-connection";
import { perceptionJevCalls } from "@workspace/lib/db/schema-perception";
import { DAILY_JEV_CALL_CEILING } from "@workspace/lib/perception/limits";
import { sql } from "drizzle-orm";

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
