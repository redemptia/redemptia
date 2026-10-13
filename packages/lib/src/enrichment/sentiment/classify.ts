import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, RetryError } from "ai";
import { structuredResearchWithUsage } from "../../providers/registry/ai-sdk";
import {
	SENTIMENT_PROVIDER,
	sentimentApiKey,
	sentimentBaseUrl,
	sentimentFallbackModels,
	sentimentModel,
} from "./availability";
import { buildSentimentPrompt, type JudgementOutput, judgementSchema } from "./prompt";

export interface ClassifierResult {
	judgements: JudgementOutput["judgements"];
	usage: { inputTokens: number; outputTokens: number; costUsd?: number };
	/** The model that actually answered, which may be a fallback. */
	model: string;
}

/** One paid call judging every listed subject in one answer. Injected, so tests never reach a model. */
export type Classifier = (answer: string, subjects: readonly string[]) => Promise<ClassifierResult>;

/**
 * A refusal the model never answered (rate limited or briefly down), so trying
 * another model can't double-bill. Gemini's free tier gives each model its own
 * quota, which is what makes moving on worth it.
 */
function isUnservedError(error: unknown): boolean {
	const cause = RetryError.isInstance(error) ? error.lastError : error;
	return APICallError.isInstance(cause) && (cause.statusCode === 429 || (cause.statusCode ?? 0) >= 500);
}

export const sentimentClassifier: Classifier = async (answer, subjects) => {
	// Chat Completions, since OpenAI-compatible endpoints don't serve the Responses API.
	const client = createOpenAI({ apiKey: sentimentApiKey(), baseURL: sentimentBaseUrl() });
	const models = [sentimentModel(), ...sentimentFallbackModels()];
	for (const [i, model] of models.entries()) {
		let result: Awaited<ReturnType<typeof structuredResearchWithUsage<JudgementOutput>>>;
		try {
			result = await structuredResearchWithUsage(client.chat(model), {
				prompt: buildSentimentPrompt(answer, subjects),
				schema: judgementSchema,
			});
		} catch (error) {
			if (i < models.length - 1 && isUnservedError(error)) continue;
			throw error;
		}
		if (!result.usage) {
			// Unpriced spend would be invisible to the ceiling, so refuse to treat it as free.
			throw new Error(`${SENTIMENT_PROVIDER} reported no usage for a sentiment call`);
		}
		return { judgements: result.output.judgements, usage: result.usage, model };
	}
	throw new Error("No sentiment model configured");
};
