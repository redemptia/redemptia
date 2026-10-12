/**
 * The two numbers that say whether the worker is keeping up: how much mention
 * recompute is waiting, and how long prompt jobs take. Without them a decision
 * to split enrichment off the scraper's worker has nothing to go on.
 */

import { getDeploymentFeatures } from "@workspace/deployment";
import { MENTION_RECOMPUTE_QUEUE } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { sql } from "drizzle-orm";

export interface WorkerHealthMetrics {
	/** Null where this deployment doesn't recompute mention analysis. */
	recomputeQueue: { queued: number; retrying: number; active: number } | null;
	/**
	 * Time prompt jobs spent running (not waiting in the queue), over those that
	 * finished in the last `windowHours`, failed and expired ones included: they
	 * are the slow ones, and leaving them out would hide an overload. Jobs that
	 * found nothing due finish at once and count too. Null p95 when none finished.
	 */
	promptLatency: { p95Seconds: number | null; finishedJobs: number; failedJobs: number; windowHours: number };
}

function enrichmentEnabled(): boolean {
	try {
		return getDeploymentFeatures().enrichment;
	} catch {
		return false;
	}
}

const WINDOW_HOURS = 24;

export async function getWorkerHealthMetrics(
	queues: { prompt: string; recompute: string } = { prompt: "process-prompt", recompute: MENTION_RECOMPUTE_QUEUE },
): Promise<WorkerHealthMetrics> {
	const recomputeEnabled = enrichmentEnabled();
	const empty: WorkerHealthMetrics = {
		recomputeQueue: recomputeEnabled ? { queued: 0, retrying: 0, active: 0 } : null,
		promptLatency: { p95Seconds: null, finishedJobs: 0, failedJobs: 0, windowHours: WINDOW_HOURS },
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
		db.execute<{ p95: number | null; n: number; failed: number }>(sql`
			SELECT
				percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM completed_on - started_on))::float8 AS p95,
				count(*)::int AS n,
				count(*) FILTER (WHERE state = 'failed')::int AS failed
			FROM pgboss.job
			WHERE name = ${queues.prompt}
				AND state IN ('completed', 'failed')
				AND started_on IS NOT NULL
				AND completed_on > now() - make_interval(hours => ${WINDOW_HOURS})`),
	]);
	return {
		recomputeQueue: recomputeEnabled ? (depth[0] ?? empty.recomputeQueue) : null,
		promptLatency: {
			p95Seconds: latency[0]?.p95 ?? null,
			finishedJobs: latency[0]?.n ?? 0,
			failedJobs: latency[0]?.failed ?? 0,
			windowHours: WINDOW_HOURS,
		},
	};
}
