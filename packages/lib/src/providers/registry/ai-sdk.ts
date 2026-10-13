import { generateText, type LanguageModel, Output, type ToolSet } from "ai";
import { z } from "zod";

type GenerateTextArgs = Parameters<typeof generateText>[0];

export interface StructuredResearchCall<T> {
	prompt: string;
	schema: z.ZodType<T>;
	tools?: ToolSet;
	providerOptions?: GenerateTextArgs["providerOptions"];
}

export async function structuredResearch<T>(model: LanguageModel, call: StructuredResearchCall<T>): Promise<T> {
	return (await structuredResearchWithUsage(model, call)).output;
}

/**
 * structuredResearch, plus the tokens the call consumed. Undefined, not zero,
 * when the SDK reports none: a paid caller must not mistake unreported spend
 * for free.
 */
export async function structuredResearchWithUsage<T>(
	model: LanguageModel,
	{ prompt, schema, tools, providerOptions }: StructuredResearchCall<T>,
): Promise<{ output: T; usage?: { inputTokens: number; outputTokens: number } }> {
	const result = await generateText({
		model,
		prompt,
		output: Output.object({ schema }),
		...(tools ? { tools } : {}),
		...(providerOptions ? { providerOptions } : {}),
	});
	const usage = result.usage;
	if (usage?.inputTokens == null) return { output: result.output as T, usage: undefined };
	// Gemini's OpenAI-compatible endpoint leaves thinking out of completion_tokens
	// but counts it in total_tokens, and bills it as output; so does this.
	const rawTotal = usage.raw?.total_tokens;
	const hidden = typeof rawTotal === "number" ? rawTotal - usage.inputTokens - (usage.outputTokens ?? 0) : 0;
	return {
		output: result.output as T,
		usage: { inputTokens: usage.inputTokens, outputTokens: (usage.outputTokens ?? 0) + Math.max(0, hidden) },
	};
}

const RESEARCH_SCHEMA_NAME = "research_output";

export function jsonSchemaResponseFormat(schema: z.ZodType): Record<string, unknown> {
	return {
		type: "json_schema",
		json_schema: { name: RESEARCH_SCHEMA_NAME, strict: true, schema: z.toJSONSchema(schema) },
	};
}

export function parseSchemaJson<T>(schema: z.ZodType<T>, content: string): T {
	return schema.parse(JSON.parse(content));
}
