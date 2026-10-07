import { PROMPT_JOB_OPTIONS } from "@workspace/lib/constants";
import { PgBoss } from "pg-boss";
import { afterAll, describe, expect, it } from "vitest";
import { getBoss } from "@/lib/boss-client";

const seeder = new PgBoss({ connectionString: process.env.DATABASE_URL, schema: "pgboss", supervise: false });

afterAll(async () => {
	await (await getBoss()).stop({ graceful: false });
	await seeder.stop({ graceful: false });
});

describe("process-prompt queue policy", () => {
	it("brings a queue created with an older policy up to date when the web app connects", async () => {
		await seeder.start();
		const stale = { retryLimit: 3, expireInSeconds: 60 * 15 };
		if (await seeder.getQueue("process-prompt")) await seeder.updateQueue("process-prompt", stale);
		else await seeder.createQueue("process-prompt", stale);

		const queue = await (await getBoss()).getQueue("process-prompt");

		expect(queue?.retryLimit).toBe(PROMPT_JOB_OPTIONS.retryLimit);
		expect(queue?.expireInSeconds).toBe(PROMPT_JOB_OPTIONS.expireInSeconds);
	});
});
