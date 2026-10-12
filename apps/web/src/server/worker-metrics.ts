/**
 * The two numbers that say whether the worker is keeping up: how much mention
 * recompute is waiting, and how long prompt jobs take. Without them a decision
 * to split enrichment off the scraper's worker has nothing to go on.
 */

import { MENTION_RECOMPUTE_QUEUE } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { sql } from "drizzle-orm";

export interface WorkerHealthMetrics {
	recomputeQueue: { queued: number; retrying: number; active: number };
	/** Over prompt jobs that completed in the last `windowHours`; null p95 when none did. */
	promptLatency: { p95Seconds: number | null; completedJobs: number; windowHours: number };
}

const WINDOW_HOURS = 24;

export async function getWorkerHealthMetrics(
	queues: { prompt: string; recompute: string } = { prompt: "process-prompt", recompute: MENTION_RECOMPUTE_QUEUE },
): Promise<WorkerHealthMetrics> {
	const empty: WorkerHealthMetrics = {
		recomputeQueue: { queued: 0, retrying: 0, active: 0 },
		promptLatency: { p95Seconds: null, completedJobs: 0, windowHours: WINDOW_HOURS },
	};
	// pg-boss creates its schema when a worker or web client first starts.
	const { rows: exists } = await db.execute<{ ok: boolean }>(sql`SELECT to_regclass('pgboss.job') IS NOT NULL AS ok`);
	if (!exists[0]?.ok) return empty;

	const [{ rows: depth }, { rows: latency }] = await Promise.all([
		db.execute<{ queued: number; retrying: number; active: number }>(sql`
			SELECT
				count(*) FILTER (WHERE state = 'created')::int AS queued,
				count(*) FILTER (WHERE state = 'retry')::int AS retrying,
				count(*) FILTER (WHERE state = 'active')::int AS active
			FROM pgboss.job WHERE name = ${queues.recompute}`),
		db.execute<{ p95: number | null; n: number }>(sql`
			SELECT
				percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM completed_on - started_on))::float8 AS p95,
				count(*)::int AS n
			FROM pgboss.job
			WHERE name = ${queues.prompt}
				AND state = 'completed'
				AND started_on IS NOT NULL
				AND completed_on > now() - make_interval(hours => ${WINDOW_HOURS})`),
	]);
	return {
		recomputeQueue: depth[0] ?? empty.recomputeQueue,
		promptLatency: {
			p95Seconds: latency[0]?.p95 ?? null,
			completedJobs: latency[0]?.n ?? 0,
			windowHours: WINDOW_HOURS,
		},
	};
}
