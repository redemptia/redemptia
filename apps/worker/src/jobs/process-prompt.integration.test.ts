import { randomUUID } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { brands, organization, promptRuns, prompts, usageEvents } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn().mockResolvedValue("job-id");
vi.mock("../boss", () => ({ getBoss: () => ({ send, insert: vi.fn().mockResolvedValue([]) }) }));

import { processPromptJob } from "./process-prompt";

let orgId: string;
let promptId: string;

const events = (count: number) =>
	db
		.insert(usageEvents)
		.values(Array.from({ length: count }, () => ({ organizationId: orgId, brandId: orgId, eventType: "prompt_run" })));
const runs = async () => (await db.select().from(promptRuns).where(eq(promptRuns.promptId, promptId))).length;
const fire = () => processPromptJob([{ data: { promptId } } as never]);

beforeEach(async () => {
	vi.stubEnv("DEPLOYMENT_MODE", "local");
	vi.stubEnv("SCRAPE_TARGETS", "stub:stub");
	vi.stubEnv("RUNS_PER_PROMPT", "1");
	vi.stubEnv("DAILY_PROVIDER_CALL_CEILING", "3");
	send.mockClear();
	orgId = `pp-${randomUUID()}`;
	await db.insert(organization).values({ id: orgId, name: orgId, slug: orgId, createdAt: new Date() });
	await db
		.insert(brands)
		.values({ id: orgId, organizationId: orgId, name: "Acme", website: "https://acme.example", onboarded: true });
	[{ id: promptId }] = await db
		.insert(prompts)
		.values({ brandId: orgId, value: "Which tool?" })
		.returning({ id: prompts.id });
});

afterEach(async () => {
	vi.unstubAllEnvs();
	await db.delete(usageEvents).where(eq(usageEvents.organizationId, orgId));
	await db.delete(promptRuns).where(eq(promptRuns.brandId, orgId));
	await db.delete(prompts).where(eq(prompts.brandId, orgId));
	await db.delete(brands).where(eq(brands.id, orgId));
	await db.delete(organization).where(eq(organization.id, orgId));
});

describe("daily provider call ceiling, unmetered", () => {
	it("calls the provider while the organization is under the ceiling", async () => {
		await events(2);
		await fire();
		expect(await runs()).toBe(1);
	});

	it("skips the cycle without calling anyone once the ceiling is reached, and still schedules the next", async () => {
		await events(3);
		await fire();
		expect(await runs()).toBe(0);
		expect(send).toHaveBeenCalledWith("process-prompt", expect.objectContaining({ promptId }), expect.anything());
	});

	it("derives a ceiling from the prompts and targets when no override is set", async () => {
		vi.stubEnv("DAILY_PROVIDER_CALL_CEILING", "");
		// 1 prompt × 1 target × 1 sample a day, with headroom: 2 calls
		await events(2);
		await fire();
		expect(await runs()).toBe(0);
	});
});
