import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// node-postgres's own default, kept so that leaving DATABASE_POOL_MAX unset changes nothing.
export const DATABASE_POOL_MAX_FALLBACK = 10;

/**
 * Connections in this process's pool: DATABASE_POOL_MAX, or 10 when it is unset
 * or not a positive integer.
 *
 * Do the arithmetic before raising it. The worker alone can run about 16
 * handlers at once (process-prompt 10, generate-report 2, analyze-brand 2,
 * schedule-maintenance 1, sync-auth0-memberships 1 in whitelabel), so 10 is
 * already over-subscribed there, and withQuotaLock pins a connection for the
 * whole of its transaction. But every process gets its own pool: the e2e stack
 * (four web containers and a worker) holds five, so 5 × 10 = 50 of Postgres's
 * default max_connections of 100 before anything else connects. Multiply the
 * new value by the number of processes sharing the database first.
 */
export function getDatabasePoolMax(): number {
	const raw = process.env.DATABASE_POOL_MAX;
	if (!raw) return DATABASE_POOL_MAX_FALLBACK;
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed < 1) return DATABASE_POOL_MAX_FALLBACK;
	return parsed;
}

export const db = drizzle({
	connection: { connectionString: process.env.DATABASE_URL!, max: getDatabasePoolMax() },
	schema,
});
