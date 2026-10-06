/**
 * A process-prompt job that pg-boss retries re-submits the whole paid provider
 * fan-out, so every path the web app enqueues one through must opt out of
 * queue-level retries. Send-time options override the queue policy.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn(async () => "job_1");
const unschedule = vi.fn(async () => {});

vi.mock("@/lib/boss-client", () => ({
	getBoss: async () => ({ send, unschedule }),
}));

vi.mock("@workspace/lib/db/db", () => ({
	db: {
		query: {
			prompts: { findFirst: async () => ({ id: "prompt_1", brandId: "brand_1" }) },
			brands: { findFirst: async () => ({ id: "brand_1", name: "Acme", delayOverrideHours: null }) },
		},
	},
}));

const { createPromptJobScheduler, createMultiplePromptJobSchedulers, sendImmediatePromptJob } = await import(
	"@/lib/job-scheduler"
);

function promptJobOptions() {
	const calls = send.mock.calls as unknown as [string, unknown, Record<string, unknown>][];
	const promptCalls = calls.filter(([queue]) => queue === "process-prompt");
	expect(promptCalls.length).toBeGreaterThan(0);
	return promptCalls.map(([, , options]) => options);
}

describe("prompt job enqueueing", () => {
	beforeEach(() => {
		send.mockClear();
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	it("never retries a prompt job scheduled to run now", async () => {
		await expect(createPromptJobScheduler("prompt_1")).resolves.toBe(true);
		for (const options of promptJobOptions()) expect(options.retryLimit).toBe(0);
	});

	it("never retries a prompt job scheduled for its next cadence", async () => {
		await expect(createPromptJobScheduler("prompt_1", { sendImmediate: false })).resolves.toBe(true);
		for (const options of promptJobOptions()) expect(options.retryLimit).toBe(0);
	});

	it("never retries prompt jobs scheduled in bulk", async () => {
		await expect(createMultiplePromptJobSchedulers(["prompt_1", "prompt_2"])).resolves.toEqual([true, true]);
		const options = promptJobOptions();
		expect(options).toHaveLength(2);
		for (const option of options) expect(option.retryLimit).toBe(0);
	});

	it("never retries a manually triggered prompt job", async () => {
		await expect(sendImmediatePromptJob("prompt_1")).resolves.toBe(true);
		for (const options of promptJobOptions()) expect(options.retryLimit).toBe(0);
	});
});
