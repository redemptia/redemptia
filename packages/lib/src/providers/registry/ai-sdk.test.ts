import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const generateText = vi.fn();
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("ai")>()), generateText }));

const { structuredResearchWithUsage } = await import("./ai-sdk");

const call = { prompt: "p", schema: z.object({}) };
const model = {} as Parameters<typeof structuredResearchWithUsage>[0];

describe("structuredResearchWithUsage", () => {
	beforeEach(() => generateText.mockReset());

	it("bills thinking tokens that the provider counts only in its total as output", async () => {
		generateText.mockResolvedValue({
			output: {},
			usage: {
				inputTokens: 300,
				outputTokens: 100,
				raw: { prompt_tokens: 300, completion_tokens: 100, total_tokens: 1400 },
			},
		});
		const { usage } = await structuredResearchWithUsage(model, call);
		expect(usage).toEqual({ inputTokens: 300, outputTokens: 1100 });
	});

	it("keeps the reported output when the total adds nothing", async () => {
		generateText.mockResolvedValue({ output: {}, usage: { inputTokens: 300, outputTokens: 100 } });
		const { usage } = await structuredResearchWithUsage(model, call);
		expect(usage).toEqual({ inputTokens: 300, outputTokens: 100 });
	});

	it("reports no usage, not zero, when the provider gives none", async () => {
		generateText.mockResolvedValue({ output: {}, usage: { inputTokens: undefined } });
		const { usage } = await structuredResearchWithUsage(model, call);
		expect(usage).toBeUndefined();
	});
});
