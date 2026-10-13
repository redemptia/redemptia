import { db } from "@workspace/lib/db/db";
import { usageEvents } from "@workspace/lib/db/schema";
import { estimateTokenCostUsd } from "@workspace/lib/usage";
import { isOrgOverDailyCeiling, isOrgOverEnrichmentCeiling } from "@workspace/lib/usage/ceiling";
import { recordUsageEvent, type UsageEventType } from "@workspace/lib/usage/events";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createBrand, deleteBrand } from "@/test/integration/stats-fixtures";

const CAP = 2;
const orgIds: string[] = [];

async function org() {
	const id = await createBrand();
	orgIds.push(id);
	return id;
}

async function spend(orgId: string, eventType: UsageEventType, costs: number[], hoursAgo = 0) {
	for (const cost of costs) {
		await db.insert(usageEvents).values({
			organizationId: orgId,
			brandId: orgId,
			eventType,
			estimatedCostUsd: cost.toFixed(6),
			createdAt: sql`now() - make_interval(hours => ${hoursAgo})`,
		});
	}
}

afterAll(async () => {
	for (const id of orgIds) {
		await db.delete(usageEvents).where(eq(usageEvents.organizationId, id));
		await deleteBrand(id);
	}
});

describe("enrichment spend ceiling", () => {
	it("refuses an org whose sentiment spend in the last 24h has reached the cap", async () => {
		const orgId = await org();
		await spend(orgId, "sentiment-analysis", [1.25, 0.75]);
		await expect(isOrgOverEnrichmentCeiling(orgId, CAP)).resolves.toBe(true);
	});

	it("allows an org still under the cap", async () => {
		const orgId = await org();
		await spend(orgId, "sentiment-analysis", [1.25, 0.74]);
		await expect(isOrgOverEnrichmentCeiling(orgId, CAP)).resolves.toBe(false);
	});

	it("forgets spend older than 24 hours", async () => {
		const orgId = await org();
		await spend(orgId, "sentiment-analysis", [5], 25);
		await expect(isOrgOverEnrichmentCeiling(orgId, CAP)).resolves.toBe(false);
	});

	it("doesn't count scraper spend toward the enrichment cap", async () => {
		const orgId = await org();
		await spend(orgId, "prompt_run", [3, 3]);
		await spend(orgId, "prompt_run_failed", [3]);
		await expect(isOrgOverEnrichmentCeiling(orgId, CAP)).resolves.toBe(false);
	});

	it("leaves the scraper ceiling unaffected by enrichment spend", async () => {
		const orgId = await org();
		await spend(
			orgId,
			"sentiment-analysis",
			Array.from({ length: 10 }, () => 1),
		);
		await spend(orgId, "prompt_run", [0.01, 0.01]);
		await expect(isOrgOverEnrichmentCeiling(orgId, CAP)).resolves.toBe(true);
		await expect(isOrgOverDailyCeiling(orgId, 3)).resolves.toBe(false);
	});
});

describe("recordUsageEvent", () => {
	it("stores the raw token counts beside the cost derived from them", async () => {
		const orgId = await org();
		const usage = { inputTokens: 1200, outputTokens: 300 };
		await recordUsageEvent({
			organizationId: orgId,
			brandId: orgId,
			promptId: null,
			eventType: "sentiment-analysis",
			provider: "openai-api",
			model: "gpt-5-mini",
			estimatedCostUsd: estimateTokenCostUsd(usage),
			...usage,
		});
		const [row] = await db.select().from(usageEvents).where(eq(usageEvents.organizationId, orgId));
		expect(row).toMatchObject({ inputTokens: 1200, outputTokens: 300, eventType: "sentiment-analysis" });
		expect(Number(row.estimatedCostUsd)).toBeCloseTo(estimateTokenCostUsd(usage), 6);
	});
});
