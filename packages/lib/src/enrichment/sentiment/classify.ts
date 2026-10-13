import { runStructuredCompletionPrompt } from "../../onboarding/llm";
import { SENTIMENT_FALLBACK_MODELS, SENTIMENT_PROVIDER, sentimentModel } from "./availability";
import { buildSentimentPrompt, type JudgementOutput, judgementSchema } from "./prompt";

export interface ClassifierResult {
	judgements: JudgementOutput["judgements"];
	usage: { inputTokens: number; outputTokens: number; costUsd?: number };
	/** The model that actually answered, which may be a fallback. */
	model: string;
}

/** One paid call judging every listed subject in one answer. Injected, so tests never reach a model. */
export type Classifier = (answer: string, subjects: readonly string[]) => Promise<ClassifierResult>;

export const sentimentClassifier: Classifier = async (answer, subjects) => {
	const model = sentimentModel();
	const result = await runStructuredCompletionPrompt(buildSentimentPrompt(answer, subjects), judgementSchema, {
		provider: SENTIMENT_PROVIDER,
		model,
		fallbackModels: SENTIMENT_FALLBACK_MODELS,
	});
	if (!result.usage) {
		// Unpriced spend would be invisible to the ceiling, so refuse to treat it as free.
		throw new Error(`${SENTIMENT_PROVIDER} reported no usage for a sentiment call`);
	}
	return {
		judgements: result.object.judgements,
		usage: result.usage,
		model: result.servedModel ?? result.modelVersion ?? model,
	};
};
