import { MENTION_RECOMPUTE_QUEUE } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { runSubjectMentions } from "@workspace/lib/db/schema";
import { reconcileRunAnalyses } from "@workspace/lib/enrichment/reconcile";
import { insertRunText } from "@workspace/lib/run-texts";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBoss } from "@/lib/boss-client";
import { enqueueMentionRecompute } from "@/lib/job-scheduler";
import { setBrandCompetitors } from "@/server/competitors-core";
import { updateBrand } from "@/server/onboarding-core";
import { createBrand, createPrompt, createRun, deleteBrand } from "@/test/integration/stats-fixtures";

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
	await db.execute(sql`DELETE FROM pgboss.job WHERE name = ${MENTION_RECOMPUTE_QUEUE}`);
	for (const id of brandIds) await deleteBrand(id);
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

describe("the recompute a rename queues", () => {
	it("moves a renamed competitor's mentions to its new id", async () => {
		const brandId = await newBrand();
		const [globex] = await setBrandCompetitors(brandId, [{ name: "Globex", domains: ["globex.com"], aliases: [] }]);
		const promptId = await createPrompt(brandId);
		const run = await createRun(brandId, promptId, { at: "2026-10-01T12:00:00Z", brandMentioned: false });
		await insertRunText(db, run.id, "Globex Corp leads.");
		await reconcileRunAnalyses({ brandId, batchSize: 50, pauseMs: 0, dryRun: false });

		const [renamed] = await setBrandCompetitors(brandId, [
			{ name: "Globex Corp", domains: ["globex.com"], aliases: [] },
		]);
		expect(renamed.id).not.toBe(globex.id);
		await reconcileRunAnalyses({ brandId, batchSize: 50, pauseMs: 0, dryRun: false });

		const keys = await db
			.select({ key: runSubjectMentions.subjectKey, name: runSubjectMentions.subjectName })
			.from(runSubjectMentions)
			.where(eq(runSubjectMentions.promptRunId, run.id));
		expect(keys).toEqual([{ key: renamed.id, name: "Globex Corp" }]);
	});
});
