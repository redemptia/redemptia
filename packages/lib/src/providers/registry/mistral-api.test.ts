import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { API_PROVIDER_MAX_OUTPUT_TOKENS } from "../config";
import { mistralApi } from "./mistral-api";

const CAP = API_PROVIDER_MAX_OUTPUT_TOKENS["mistral-api"];

function stubFetch(json: unknown) {
	const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => json });
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
	const [, init] = fetchMock.mock.calls[0];
	return JSON.parse((init as RequestInit).body as string);
}

function calledUrl(fetchMock: ReturnType<typeof vi.fn>): string {
	return fetchMock.mock.calls[0][0] as string;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("mistral-api run", () => {
	it("caps output tokens and keeps the web_search tool on the web path", async () => {
		const fetchMock = stubFetch({ model: "mistral-medium-latest", outputs: [] });

		await mistralApi.run("mistral", "prompt", { webSearch: true, version: "mistral-medium-latest" });

		expect(calledUrl(fetchMock)).toContain("/v1/conversations");
		const body = sentBody(fetchMock);
		expect(body.tools).toEqual([{ type: "web_search" }]);
		expect(body.completion_args).toEqual({ max_tokens: CAP });
	});

	it("caps output tokens on the non-web chat-completions path", async () => {
		const fetchMock = stubFetch({ model: "mistral-medium-latest", choices: [{ message: { content: "answer" } }] });

		await mistralApi.run("mistral", "prompt", { webSearch: false, version: "mistral-medium-latest" });

		expect(calledUrl(fetchMock)).toContain("/v1/chat/completions");
		expect(sentBody(fetchMock).max_tokens).toBe(CAP);
	});
});

describe("mistral-api runStructuredResearch", () => {
	const schema = z.object({ ok: z.boolean() });
	const completion = (model?: string) => ({
		...(model ? { model } : {}),
		choices: [{ message: { content: '{"ok":true}' } }],
	});
	const conversation = (model?: string) => ({ ...(model ? { model } : {}), outputs: [{ content: '{"ok":true}' }] });

	it("sends the requested model on both endpoints", async () => {
		const completionFetch = stubFetch(completion());
		await mistralApi.runStructuredResearch!({ prompt: "p", schema, webSearch: false, model: "mistral-small-latest" });
		expect(sentBody(completionFetch).model).toBe("mistral-small-latest");

		const conversationFetch = stubFetch(conversation());
		await mistralApi.runStructuredResearch!({ prompt: "p", schema, model: "mistral-small-latest" });
		expect(calledUrl(conversationFetch)).toContain("/v1/conversations");
		expect(sentBody(conversationFetch).model).toBe("mistral-small-latest");
	});

	it("uses mistral-large-latest when no model is requested", async () => {
		const fetchMock = stubFetch(completion());
		const res = await mistralApi.runStructuredResearch!({ prompt: "p", schema, webSearch: false });

		expect(sentBody(fetchMock).model).toBe("mistral-large-latest");
		expect(res.modelVersion).toBe("mistral-large-latest");
	});

	it("reports the model Mistral echoes back, else the requested one", async () => {
		stubFetch(completion("mistral-small-2506"));
		const echoed = await mistralApi.runStructuredResearch!({
			prompt: "p",
			schema,
			webSearch: false,
			model: "mistral-small-latest",
		});
		expect(echoed).toEqual({ object: { ok: true }, modelVersion: "mistral-small-2506" });

		stubFetch(conversation());
		const unechoed = await mistralApi.runStructuredResearch!({ prompt: "p", schema, model: "mistral-small-latest" });
		expect(unechoed.modelVersion).toBe("mistral-small-latest");
	});
});
