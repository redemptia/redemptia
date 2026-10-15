import { beforeEach, describe, expect, it, vi } from "vitest";

const answers: unknown[] = [];

vi.mock("@clack/prompts", () => ({
	note: () => undefined,
	password: async () => answers.shift(),
	isCancel: () => false,
	cancel: () => undefined,
}));

const { askSentimentKey } = await import("./sentiment.js");

describe("askSentimentKey", () => {
	beforeEach(() => {
		answers.length = 0;
	});

	it("saves the key the user gives, trimmed", async () => {
		answers.push("  AIza-test-key  ");
		const env: Record<string, string> = {};
		await askSentimentKey(env);
		expect(env).toEqual({ SENTIMENT_API_KEY: "AIza-test-key" });
	});

	it("leaves sentiment off when the answer is blank", async () => {
		answers.push("   ");
		const env: Record<string, string> = {};
		await askSentimentKey(env);
		expect(env).toEqual({});
	});
});
