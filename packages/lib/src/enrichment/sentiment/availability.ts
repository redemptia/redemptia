import { getCredential } from "../../secrets";

/**
 * The analyzer calls an OpenAI-compatible endpoint (Gemini's by default) with
 * its own key and base URL, never the openai-api scraper's. That endpoint bills
 * by token but reports no cost, so each call is priced from its tokens.
 */
export const SENTIMENT_PROVIDER = "openai-compatible";
export const DEFAULT_SENTIMENT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
export const DEFAULT_SENTIMENT_MODEL = "gemini-3.5-flash-lite";
/** Tried in order when the primary is rate limited or down; each has its own free-tier quota. */
export const SENTIMENT_FALLBACK_MODELS = ["gemini-3.1-flash-lite"];

export function sentimentApiKey(): string | undefined {
	return getCredential("SENTIMENT_API_KEY")?.trim() || undefined;
}

/**
 * Whether this deployment can run the paid sentiment analyzer: the enrichment
 * feature is on (it's off in demo) and the analyzer has a key. The caller
 * passes its deployment features, since lib can't depend on the deployment
 * package. Never throws: no deployment is guaranteed an LLM, and this only
 * ever answers no.
 */
export function sentimentAvailable(features: { enrichment: boolean }): boolean {
	try {
		return features.enrichment && sentimentApiKey() !== undefined;
	} catch {
		return false;
	}
}

export function sentimentBaseUrl(env: Record<string, string | undefined> = process.env): string {
	return env.SENTIMENT_BASE_URL?.trim() || DEFAULT_SENTIMENT_BASE_URL;
}

export function sentimentModel(env: Record<string, string | undefined> = process.env): string {
	return env.SENTIMENT_MODEL?.trim() || DEFAULT_SENTIMENT_MODEL;
}

/**
 * Fallback models from SENTIMENT_FALLBACK_MODELS (comma-separated; "none" for
 * no fallback), else the defaults.
 */
export function sentimentFallbackModels(env: Record<string, string | undefined> = process.env): string[] {
	const raw = env.SENTIMENT_FALLBACK_MODELS?.trim();
	if (!raw) return SENTIMENT_FALLBACK_MODELS;
	if (raw.toLowerCase() === "none") return [];
	return raw
		.split(",")
		.map((m) => m.trim())
		.filter(Boolean);
}
