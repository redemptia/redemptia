import { randomUUID } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getBoss } from "@/lib/boss-client";
import { getWorkerHealthMetrics } from "@/server/worker-metrics";

// Queues of their own, so jobs other tests leave in the shared queues can't count.
const queues = { prompt: `metrics-prompt-${randomUUID()}`, recompute: `metrics-recompute-${randomUUID()}` };

/** A job in `queue`, moved to `state` with the given run time in seconds (and finished `agoHours` ago). */
async function job(queue: string, state: string, seconds?: number, agoHours = 1) {
	const boss = await getBoss();
	const id = await boss.send(queue, {});
	await db.execute(sql`
		UPDATE pgboss.job SET state = ${state}::pgboss.job_state,
			started_on = CASE WHEN ${seconds ?? null}::int IS NULL THEN started_on
				ELSE now() - make_interval(hours => ${agoHours}) - make_interval(secs => ${seconds ?? 0}) END,
			completed_on = CASE WHEN ${state} = 'completed' THEN now() - make_interval(hours => ${agoHours}) ELSE completed_on END
		WHERE id = ${id}::uuid AND name = ${queue}`);
}

beforeAll(async () => {
	const boss = await getBoss();
	await boss.createQueue(queues.prompt);
	await boss.createQueue(queues.recompute);

	for (const seconds of Array.from({ length: 20 }, (_, i) => (i + 1) * 10)) {
		await job(queues.prompt, "completed", seconds);
	}
	// Finished before the window, and far slower: must not count.
	await job(queues.prompt, "completed", 10_000, 48);
	// Running, not finished: has no latency yet.
	await job(queues.prompt, "active", 5_000);

	await job(queues.recompute, "created");
	await job(queues.recompute, "created");
	await job(queues.recompute, "retry");
	await job(queues.recompute, "active");
	await job(queues.recompute, "completed", 30);
});

afterAll(async () => {
	const boss = await getBoss();
	await boss.deleteQueue(queues.prompt);
	await boss.deleteQueue(queues.recompute);
	await boss.stop({ graceful: false });
});

describe("getWorkerHealthMetrics", () => {
	it("counts recompute work that is waiting, retrying or running, not finished work", async () => {
		const { recomputeQueue } = await getWorkerHealthMetrics(queues);
		expect(recomputeQueue).toEqual({ queued: 2, retrying: 1, active: 1 });
	});

	it("reports the 95th percentile run time of prompt jobs finished in the last day", async () => {
		const { promptLatency } = await getWorkerHealthMetrics(queues);
		// 10s, 20s … 200s: the continuous 95th percentile of those twenty.
		expect(promptLatency.completedJobs).toBe(20);
		expect(promptLatency.p95Seconds).toBeCloseTo(190.5, 5);
	});
});
