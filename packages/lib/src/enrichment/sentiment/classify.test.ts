import { APICallError } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const call = vi.fn();
vi.mock("../../providers/registry/ai-sdk", () => ({ structuredResearchWithUsage: call }));
const createOpenAI = vi.fn((_: { apiKey?: string; baseURL?: string }) => ({ chat: (model: string) => ({ model }) }));
vi.mock("@ai-sdk/openai", () => ({ createOpenAI }));

const { sentimentClassifier } = await import("./classify");

const answered = { output: { judgements: [] }, usage: { inputTokens: 10, outputTokens: 5 } };
const rejected = (statusCode: number) =>
	new APICallError({ message: "x", url: "u", requestBodyValues: {}, statusCode, isRetryable: false });

describe("sentimentClassifier", () => {
	beforeEach(() => {
		call.mockReset();
		createOpenAI.mockClear();
		vi.stubEnv("SENTIMENT_API_KEY", "sentiment-key");
		vi.stubEnv("OPENAI_API_KEY", "scraper-key");
		vi.stubEnv("SENTIMENT_MODEL", "gemini-3.5-flash-lite");
		vi.stubEnv("SENTIMENT_FALLBACK_MODELS", "gemini-3.1-flash-lite");
	});

	it("calls the analyzer's own endpoint with its own key, never the scraper's", async () => {
		vi.stubEnv("SENTIMENT_BASE_URL", "https://example.test/v1/");
		call.mockResolvedValueOnce(answered);
		await sentimentClassifier("answer", ["Northwind"]);
		expect(createOpenAI).toHaveBeenCalledWith({ apiKey: "sentiment-key", baseURL: "https://example.test/v1/" });
	});

	it("moves to the next model when one is rate limited, and reports which answered", async () => {
		call.mockRejectedValueOnce(rejected(429)).mockResolvedValueOnce(answered);
		const result = await sentimentClassifier("answer", ["Northwind"]);
		expect(call.mock.calls.map((c) => c[0].model)).toEqual(["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]);
		expect(result.model).toBe("gemini-3.1-flash-lite");
	});

	it("doesn't retry on another model after an answered call fails", async () => {
		call.mockRejectedValueOnce(rejected(400));
		await expect(sentimentClassifier("answer", ["Northwind"])).rejects.toThrow();
		expect(call).toHaveBeenCalledTimes(1);
	});

	it("gives up when every model is rate limited", async () => {
		call.mockRejectedValue(rejected(429));
		await expect(sentimentClassifier("answer", ["Northwind"])).rejects.toThrow();
		expect(call).toHaveBeenCalledTimes(2);
	});
});
