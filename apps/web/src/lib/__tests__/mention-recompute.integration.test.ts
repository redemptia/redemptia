import { randomUUID } from "node:crypto";
import {
	MENTION_RECOMPUTE_QUEUE,
	MENTION_RECOMPUTE_QUEUE_OPTIONS,
	MENTION_RECOMPUTE_QUEUE_POLICY,
} from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBoss } from "@/lib/boss-client";
import { enqueueMentionRecompute } from "@/lib/job-scheduler";
import { updateBrand } from "@/server/onboarding-core";
import { createBrand, deleteBrand } from "@/test/integration/stats-fixtures";

const brandIds: string[] = [];

async function newBrand() {
	const id = await createBrand();
	brandIds.push(id);
	return id;
}

async function queued(brandId: string) {
	const { rows } = await db.execute<{ state: string; n: number }>(sql`
		SELECT state, count(*)::int AS n FROM pgboss.job
		WHERE name = ${MENTION_RECOMPUTE_QUEUE} AND singleton_key = ${brandId}
		GROUP BY state`);
	return Object.fromEntries(rows.map((row) => [row.state, row.n]));
}

beforeEach(() => {
	vi.stubEnv("DEPLOYMENT_MODE", "local");
});

afterEach(() => {
	vi.unstubAllEnvs();
});

afterAll(async () => {
	// Only this file's brands: other files queue recomputes on the same queue in parallel.
	for (const id of brandIds) {
		await db.execute(sql`DELETE FROM pgboss.job WHERE name = ${MENTION_RECOMPUTE_QUEUE} AND singleton_key = ${id}`);
		await deleteBrand(id);
	}
	await (await getBoss()).stop({ graceful: false });
});

describe("queueing a mention recompute", () => {
	it("queues one recompute when a brand's subjects change, folding further edits into it", async () => {
		const brandId = await newBrand();
		await updateBrand({ brandId, aliases: ["Acme Corp"] });
		await updateBrand({ brandId, brandName: "Acme Inc" });

		expect(await queued(brandId)).toEqual({ created: 1 });
	});

	it("queues nothing for an edit that leaves the brand's subjects alone", async () => {
		const brandId = await newBrand();
		await updateBrand({ brandId, enabled: false });

		expect(await queued(brandId)).toEqual({});
	});

	it("queues one more while a recompute is running, for the edits that came after it started", async () => {
		const brandId = await newBrand();
		await enqueueMentionRecompute(brandId);
		// Start it the way the worker's fetch would. The queue is shared with other
		// tests, so fetching could pick up another brand's job.
		await db.execute(sql`
			UPDATE pgboss.job SET state = 'active', started_on = now()
			WHERE name = ${MENTION_RECOMPUTE_QUEUE} AND singleton_key = ${brandId}`);
		expect(await queued(brandId)).toEqual({ active: 1 });

		await enqueueMentionRecompute(brandId);
		await enqueueMentionRecompute(brandId);

		expect(await queued(brandId)).toEqual({ active: 1, created: 1 });
	});

	it("never fails the edit that called it, even with the deployment misconfigured", async () => {
		vi.stubEnv("DEPLOYMENT_MODE", "");
		await expect(enqueueMentionRecompute(await newBrand())).resolves.toBeUndefined();
	});

	it("queues nothing in demo, which has no recompute worker", async () => {
		vi.stubEnv("DEPLOYMENT_MODE", "demo");
		const brandId = await newBrand();
		await enqueueMentionRecompute(brandId);

		expect(await queued(brandId)).toEqual({});
	});
});

describe("the recompute queue's policy", () => {
	it("starts one job per brand at a time, with one more waiting and later sends folded into it", async () => {
		// A queue of its own, built from the same policy and options, so jobs other
		// tests queued can't be the ones fetched.
		const boss = await getBoss();
		const queue = `recompute-policy-test-${randomUUID()}`;
		await boss.createQueue(queue, { policy: MENTION_RECOMPUTE_QUEUE_POLICY, ...MENTION_RECOMPUTE_QUEUE_OPTIONS });
		try {
			await boss.send(queue, {}, { singletonKey: "brand-a" });
			expect(await boss.fetch(queue)).toHaveLength(1);

			expect(await boss.send(queue, {}, { singletonKey: "brand-a" })).not.toBeNull();
			expect(await boss.send(queue, {}, { singletonKey: "brand-a" })).toBeNull();
			expect(await boss.fetch(queue)).toEqual([]);
		} finally {
			await boss.deleteQueue(queue);
		}
	});
});
