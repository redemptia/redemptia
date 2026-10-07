import { db } from "@workspace/lib/db/db";
import { usageEvents } from "@workspace/lib/db/schema";
import { isOrgOverDailyCeiling } from "@workspace/lib/usage/ceiling";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createBrand, deleteBrand } from "@/test/integration/stats-fixtures";

const CEILING = 3;
const orgIds: string[] = [];

/** createBrand gives each brand its own organization, keyed by the brand id. */
async function org() {
	const id = await createBrand();
	orgIds.push(id);
	return id;
}

async function recordEvents(orgId: string, eventType: string, count: number) {
	await db
		.insert(usageEvents)
		.values(Array.from({ length: count }, () => ({ organizationId: orgId, brandId: orgId, eventType })));
}

afterAll(async () => {
	for (const id of orgIds) {
		await db.delete(usageEvents).where(eq(usageEvents.organizationId, id));
		await deleteBrand(id);
	}
});

describe("org daily run ceiling", () => {
	it("ignores usage events the scraper didn't write", async () => {
		const orgId = await org();
		await recordEvents(orgId, "enrichment", CEILING * 2);

		await expect(isOrgOverDailyCeiling(orgId, CEILING)).resolves.toBe(false);
	});

	it("doesn't let other events push scraper attempts over the ceiling", async () => {
		const orgId = await org();
		await recordEvents(orgId, "prompt_run", CEILING - 1);
		await recordEvents(orgId, "enrichment", CEILING);

		await expect(isOrgOverDailyCeiling(orgId, CEILING)).resolves.toBe(false);
	});

	it("trips on successful and failed scraper attempts alike", async () => {
		const orgId = await org();
		await recordEvents(orgId, "prompt_run", CEILING - 1);
		await recordEvents(orgId, "prompt_run_failed", 1);

		await expect(isOrgOverDailyCeiling(orgId, CEILING)).resolves.toBe(true);
	});
});
