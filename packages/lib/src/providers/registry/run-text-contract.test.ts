/**
 * The backfill re-reads a stored run's raw_output with extractRunText; the live
 * path stores the text each provider parsed itself. For every provider path, run
 * it on a mocked payload and check the two agree.
 *
 * The `it.fails` cases are known divergences (KNOWN_DIVERGENT_EXTRACTIONS in
 * run-texts.ts), recorded with the payload that shows them. A fix that makes one
 * agree turns it into a failure here: flip it to `it` and drop it from that list.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractRunText } from "../../run-texts";
import type { ScrapeResult } from "../types";

const mocks = vi.hoisted(() => ({
	anthropicCreate: vi.fn(),
	generateText: vi.fn(),
	snapshotFetch: vi.fn(),
	olostepRetrieve: vi.fn(),
	dataforseo: {
		chatGptLlmResponsesLive: vi.fn(),
		perplexityLlmResponsesLive: vi.fn(),
		googleAiModeLiveAdvanced: vi.fn(),
		googleOrganicLiveAdvanced: vi.fn(),
		chatGptLlmScraperLiveAdvanced: vi.fn(),
		geminiLlmScraperLiveAdvanced: vi.fn(),
	},
}));

vi.mock("@anthropic-ai/sdk", () => ({
	default: class {
		messages = { create: mocks.anthropicCreate };
	},
}));

vi.mock("ai", () => ({ generateText: mocks.generateText, Output: { object: vi.fn() } }));

vi.mock("@brightdata/sdk", () => ({
	bdclient: class {
		scrape = { snapshot: { cancel: vi.fn(), fetch: mocks.snapshotFetch } };
		close = vi.fn().mockResolvedValue(undefined);
	},
}));

vi.mock("olostep", () => ({
	default: class {
		batches = {
			create: async () => ({
				waitTillDone: async () => {},
				items: async function* () {
					yield { retrieve_id: "r1" };
				},
			}),
		};
		retrieve = mocks.olostepRetrieve;
	},
}));

vi.mock("dataforseo-client", () => {
	class RequestInfo {
		constructor(args: Record<string, unknown>) {
			Object.assign(this, args);
		}
	}
	return {
		AiOptimizationApi: class {
			chatGptLlmResponsesLive = mocks.dataforseo.chatGptLlmResponsesLive;
			perplexityLlmResponsesLive = mocks.dataforseo.perplexityLlmResponsesLive;
			chatGptLlmScraperLiveAdvanced = mocks.dataforseo.chatGptLlmScraperLiveAdvanced;
			geminiLlmScraperLiveAdvanced = mocks.dataforseo.geminiLlmScraperLiveAdvanced;
		},
		SerpApi: class {
			googleAiModeLiveAdvanced = mocks.dataforseo.googleAiModeLiveAdvanced;
			googleOrganicLiveAdvanced = mocks.dataforseo.googleOrganicLiveAdvanced;
		},
		SerpGoogleAiModeLiveAdvancedRequestInfo: RequestInfo,
		SerpGoogleOrganicLiveAdvancedRequestInfo: RequestInfo,
		AiOptimizationChatGptLlmResponsesLiveRequestInfo: RequestInfo,
		AiOptimizationPerplexityLlmResponsesLiveRequestInfo: RequestInfo,
		AiOptimizationGeminiLlmResponsesLiveRequestInfo: RequestInfo,
		AiOptimizationChatGptLlmScraperLiveAdvancedRequestInfo: RequestInfo,
		AiOptimizationGeminiLlmScraperLiveAdvancedRequestInfo: RequestInfo,
	};
});

import { anthropicApi } from "./anthropic-api";
import { brightdata } from "./brightdata";
import { cloro } from "./cloro";
import { dataforseo } from "./dataforseo";
import { mistralApi } from "./mistral-api";
import { olostep } from "./olostep";
import { openaiApi } from "./openai-api";
import { openrouter } from "./openrouter";
import { oxylabs } from "./oxylabs";
import { searchapi } from "./searchapi";

const ANSWER = "The Marshall Stockwell III is a well-reviewed portable speaker.";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Serve fetch from a list of responses, in order. */
function fetchSequence(...bodies: unknown[]) {
	const fetchMock = vi.fn();
	for (const body of bodies) fetchMock.mockResolvedValueOnce(jsonResponse(body));
	vi.stubGlobal("fetch", fetchMock);
}

/** Answer fetch by URL, for providers that poll an unknown number of times. */
function fetchByUrl(route: (url: string) => unknown) {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockImplementation((url: string) => Promise.resolve(jsonResponse(route(String(url))))),
	);
}

async function settle(promise: Promise<ScrapeResult>): Promise<ScrapeResult> {
	await vi.runAllTimersAsync();
	return promise;
}

function expectBackfillMatchesLive(result: ScrapeResult, provider: string, model: string) {
	expect(extractRunText(result.rawOutput, provider, model)).toBe(result.textContent);
}

const dfsTask = (result: unknown) => ({ tasks: [{ status_code: 20000, status_message: "Ok.", result: [result] }] });

beforeEach(() => {
	vi.useFakeTimers();
	for (const key of [
		"ANTHROPIC_API_KEY",
		"OPENAI_API_KEY",
		"BRIGHTDATA_API_TOKEN",
		"CLORO_API_KEY",
		"OXYLABS_USERNAME",
		"OXYLABS_PASSWORD",
		"SEARCHAPI_API_KEY",
		"OPENROUTER_API_KEY",
		"MISTRAL_API_KEY",
		"OLOSTEP_API_KEY",
		"DATAFORSEO_LOGIN",
		"DATAFORSEO_PASSWORD",
	]) {
		vi.stubEnv(key, "test");
	}
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("backfilled run text matches the live parse", () => {
	it("openai-api", async () => {
		mocks.generateText.mockResolvedValue({
			text: ANSWER,
			sources: [],
			content: [],
			finishReason: "stop",
			response: { body: { output: [{ type: "message", content: [{ type: "output_text", text: ANSWER }] }] } },
		});
		const result = await settle(openaiApi.run("chatgpt", "prompt", { webSearch: false, version: "gpt-5-mini" }));
		expectBackfillMatchesLive(result, "openai-api", "chatgpt");
	});

	it("anthropic-api", async () => {
		mocks.anthropicCreate.mockResolvedValue({
			content: [{ type: "text", text: ANSWER }],
			model: "claude-sonnet-5",
			stop_reason: "end_turn",
		});
		const result = await settle(anthropicApi.run("claude", "prompt", { webSearch: false, version: "claude-sonnet-5" }));
		expectBackfillMatchesLive(result, "anthropic-api", "claude");
	});

	it("cloro", async () => {
		fetchSequence(
			{ success: true, task: { id: "t1", status: "QUEUED" } },
			{ task: { id: "t1", status: "COMPLETED" }, response: { markdown: ANSWER, text: ANSWER } },
		);
		const result = await settle(cloro.run("chatgpt", "prompt"));
		expectBackfillMatchesLive(result, "cloro", "chatgpt");
	});

	it("oxylabs", async () => {
		fetchSequence(
			{ id: "job-1", status: "pending" },
			{ id: "job-1", status: "done" },
			{ results: [{ content: { markdown_text: ANSWER } }] },
		);
		const result = await settle(oxylabs.run("chatgpt", "prompt", { webSearch: true }));
		expectBackfillMatchesLive(result, "oxylabs", "chatgpt");
	});

	it("searchapi", async () => {
		fetchSequence({ markdown: ANSWER, text_blocks: [], reference_links: [], search_queries: [] });
		const result = await settle(searchapi.run("chatgpt", "prompt", { webSearch: true }));
		expectBackfillMatchesLive(result, "searchapi", "chatgpt");
	});

	it("openrouter", async () => {
		fetchSequence({ model: "openai/gpt-5-mini", choices: [{ message: { content: ANSWER } }] });
		const result = await settle(
			openrouter.run("chatgpt", "prompt", { webSearch: false, version: "openai/gpt-5-mini" }),
		);
		expectBackfillMatchesLive(result, "openrouter", "chatgpt");
	});

	it("olostep", async () => {
		mocks.olostepRetrieve.mockResolvedValue({ json_content: JSON.stringify({ answer_markdown: ANSWER }) });
		const result = await settle(olostep.run("chatgpt", "prompt", { webSearch: true }));
		expectBackfillMatchesLive(result, "olostep", "chatgpt");
	});

	describe("mistral-api", () => {
		it("chat completions", async () => {
			fetchSequence({ model: "mistral-medium-latest", choices: [{ message: { content: ANSWER } }] });
			const result = await settle(
				mistralApi.run("mistral", "prompt", { webSearch: false, version: "mistral-medium-latest" }),
			);
			expectBackfillMatchesLive(result, "mistral-api", "mistral");
		});

		it("web search, answer in typed chunks", async () => {
			fetchSequence({ model: "mistral-medium-latest", outputs: [{ content: [{ type: "text", text: ANSWER }] }] });
			const result = await settle(
				mistralApi.run("mistral", "prompt", { webSearch: true, version: "mistral-medium-latest" }),
			);
			expectBackfillMatchesLive(result, "mistral-api", "mistral");
		});

		// Known divergence: Conversations returns a single-shot reply's content as a
		// plain string. conversationText keeps it; extractTextFromMistral plucks only
		// array content, so the backfill reads no answer at all.
		it.fails("web search, answer as a plain string", async () => {
			fetchSequence({ model: "mistral-medium-latest", outputs: [{ content: ANSWER }] });
			const result = await settle(
				mistralApi.run("mistral", "prompt", { webSearch: true, version: "mistral-medium-latest" }),
			);
			expectBackfillMatchesLive(result, "mistral-api", "mistral");
		});
	});

	describe("dataforseo", () => {
		it("Google AI Overview", async () => {
			mocks.dataforseo.googleOrganicLiveAdvanced.mockResolvedValue(
				dfsTask({ items: [{ type: "ai_overview", markdown: ANSWER }] }),
			);
			const result = await settle(dataforseo.run("google-ai-overview", "prompt", { webSearch: true }));
			expectBackfillMatchesLive(result, "dataforseo", "google-ai-overview");
		});

		it("LLM Responses", async () => {
			mocks.dataforseo.perplexityLlmResponsesLive.mockResolvedValue(
				dfsTask({ model_name: "sonar", items: [{ type: "message", sections: [{ type: "text", text: ANSWER }] }] }),
			);
			const result = await settle(dataforseo.run("perplexity", "prompt", { webSearch: true }));
			expectBackfillMatchesLive(result, "dataforseo", "perplexity");
		});

		it("LLM Scraper, answer as top-level markdown", async () => {
			mocks.dataforseo.chatGptLlmScraperLiveAdvanced.mockResolvedValue(
				dfsTask({ model: "chatgpt", markdown: ANSWER, items: [], sources: [] }),
			);
			const result = await settle(dataforseo.run("chatgpt", "prompt", { webSearch: true }));
			expectBackfillMatchesLive(result, "dataforseo", "chatgpt");
		});

		// Known divergence: with no top-level markdown and no sources, the stored
		// result fails extractTextFromDataforseo's scraper shape check, is read as a
		// SERP response, and returns "No AI overview content found." — while the
		// live path called extractTextFromDataforseoScraper and read items[].markdown.
		it.fails("LLM Scraper, answer only in items[].markdown", async () => {
			mocks.dataforseo.chatGptLlmScraperLiveAdvanced.mockResolvedValue(
				dfsTask({ model: "chatgpt", items: [{ type: "text", markdown: ANSWER }] }),
			);
			const result = await settle(dataforseo.run("chatgpt", "prompt", { webSearch: true }));
			expectBackfillMatchesLive(result, "dataforseo", "chatgpt");
		});
	});

	describe("brightdata", () => {
		it("Google AI Overview (SERP)", async () => {
			fetchSequence({ ai_overview: { markdown: ANSWER }, organic: [] });
			const result = await settle(brightdata.run("google-ai-overview", "prompt", { webSearch: true }));
			expectBackfillMatchesLive(result, "brightdata", "google-ai-overview");
		});

		/** A dataset run: trigger, one progress poll, then the snapshot through the SDK. */
		async function datasetRun(record: Record<string, unknown>) {
			fetchByUrl((url) => (url.includes("/trigger") ? { snapshot_id: "sd_1" } : { status: "ready" }));
			mocks.snapshotFetch.mockResolvedValue([record]);
			return settle(brightdata.run("perplexity", "prompt", { webSearch: true }));
		}

		it("chatbot dataset, answer in answer_text_markdown", async () => {
			const result = await datasetRun({ answer_text_markdown: ANSWER, answer_html: "<p>…</p>" });
			expectBackfillMatchesLive(result, "brightdata", "perplexity");
		});

		// Known divergence: findAnswer falls back to response_raw, which the provider
		// strips from the stored record (with answer_html and answer_section_html), so
		// the backfill reads a later field or nothing.
		it.fails("chatbot dataset, answer only in response_raw", async () => {
			const result = await datasetRun({ response_raw: ANSWER, answer_html: "<p>…</p>" });
			expectBackfillMatchesLive(result, "brightdata", "perplexity");
		});

		// Known divergence: extractTextFromBrightdata checks ai_overview before the
		// answer fields; findAnswer never looks at it.
		it.fails("chatbot dataset carrying an ai_overview block", async () => {
			const result = await datasetRun({ answer_text_markdown: ANSWER, ai_overview: { markdown: "An overview." } });
			expectBackfillMatchesLive(result, "brightdata", "perplexity");
		});
	});
});
