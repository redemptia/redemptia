import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { API_PROVIDER_MAX_OUTPUT_TOKENS } from "../config";
import { openrouter } from "./openrouter";

function stubFetch(overrides: Record<string, unknown> = {}) {
	const fetchMock = vi.fn().mockResolvedValue({
		ok: true,
		json: async () => ({
			model: "openai/gpt-5-mini-2025-08-07",
			choices: [{ message: { content: "answer" } }],
			...overrides,
		}),
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
	const [, init] = fetchMock.mock.calls[0];
	return JSON.parse((init as RequestInit).body as string);
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("openrouter run", () => {
	it("caps output tokens and requests web search via the :online alias", async () => {
		const fetchMock = stubFetch();

		await openrouter.run("chatgpt", "prompt", { webSearch: true, version: "openai/gpt-5-mini" });

		const body = sentBody(fetchMock);
		expect(body.max_tokens).toBe(API_PROVIDER_MAX_OUTPUT_TOKENS.openrouter);
		expect(body.model).toBe("openai/gpt-5-mini:online");
		expect(body.messages).toEqual([{ role: "user", content: "prompt" }]);
	});

	it("caps output tokens and leaves the slug bare when webSearch is off", async () => {
		const fetchMock = stubFetch();

		await openrouter.run("chatgpt", "prompt", { webSearch: false, version: "openai/gpt-5-mini" });

		const body = sentBody(fetchMock);
		expect(body.max_tokens).toBe(API_PROVIDER_MAX_OUTPUT_TOKENS.openrouter);
		expect(body.model).toBe("openai/gpt-5-mini");
	});

	it("does not double-append :online when the version already carries it", async () => {
		const fetchMock = stubFetch();

		await openrouter.run("chatgpt", "prompt", { webSearch: true, version: "openai/gpt-5-mini:online" });

		expect(sentBody(fetchMock).model).toBe("openai/gpt-5-mini:online");
	});

	it("logs a warning when the response stops on the output cap", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		stubFetch({ choices: [{ message: { content: "clipped" }, finish_reason: "length" }] });

		const result = await openrouter.run("chatgpt", "prompt", { webSearch: false, version: "openai/gpt-5-mini" });

		expect(warn).toHaveBeenCalledWith(expect.stringContaining("hit the output cap"));
		// Logged, never thrown — the partial answer still flows through.
		expect(result.textContent).toBe("clipped");
	});
});

describe("openrouter runStructuredResearch", () => {
	const schema = z.object({ ok: z.boolean() });
	const jsonAnswer = { choices: [{ message: { content: '{"ok":true}' } }] };

	it("sends the requested model and reports it as the model used", async () => {
		const fetchMock = stubFetch({ ...jsonAnswer, model: "anthropic/claude-haiku-5-20260101" });
		const res = await openrouter.runStructuredResearch!({ prompt: "p", schema, model: "anthropic/claude-haiku-5" });

		expect(sentBody(fetchMock).model).toBe("anthropic/claude-haiku-5");
		expect(res).toEqual({ object: { ok: true }, modelVersion: "anthropic/claude-haiku-5" });
	});

	it("uses openai/gpt-5-mini when no model is requested", async () => {
		const fetchMock = stubFetch(jsonAnswer);
		const res = await openrouter.runStructuredResearch!({ prompt: "p", schema });

		expect(sentBody(fetchMock).model).toBe("openai/gpt-5-mini");
		expect(res.modelVersion).toBe("openai/gpt-5-mini");
	});
});
