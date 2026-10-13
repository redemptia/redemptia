import { getProvider } from "../../providers";

/** OpenRouter, so the analyzer can route between Gemini models and report each call's billed cost. */
export const SENTIMENT_PROVIDER = "openrouter";
export const DEFAULT_SENTIMENT_MODEL = "google/gemini-2.5-flash";
/** Tried in order when the primary model is unavailable or rate limited. */
export const SENTIMENT_FALLBACK_MODELS = ["google/gemini-2.5-flash-lite"];

/**
 * Whether this deployment can run the paid sentiment analyzer: the enrichment
 * feature is on (it's off in demo) and the analyzer's provider has a key. The
 * caller passes its deployment features, since lib can't depend on the
 * deployment package. Never throws: no deployment is guaranteed an LLM, and
 * this only ever answers no.
 */
export function sentimentAvailable(features: { enrichment: boolean }): boolean {
	try {
		return features.enrichment && getProvider(SENTIMENT_PROVIDER).isConfigured();
	} catch {
		return false;
	}
}

export function sentimentModel(env: Record<string, string | undefined> = process.env): string {
	return env.SENTIMENT_MODEL?.trim() || DEFAULT_SENTIMENT_MODEL;
}
