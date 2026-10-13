/**
 * Rough per-run cost estimates in USD, by provider, used to stamp
 * usage_events.estimated_cost_usd.
 *
 * These are deliberately coarse placeholders for internal attribution and
 * anomaly spotting — tune them against real provider invoices (that
 * comparison is the point of collecting usage_events, not something these
 * numbers replace). Missing provider → null cost, event still recorded.
 *
 * NOTE: These numbers live in the public repository. They are coarse
 * placeholders for internal attribution — if they ever approach public
 * list prices, move them to config/env so they remain internal.
 */

const PROVIDER_COST_ESTIMATES_USD: Record<string, number> = {
	// Exact, not rounded: one flat price per search on every engine.
	searchapi: 0.004,
	olostep: 0.01,
	brightdata: 0.01,
	oxylabs: 0.01,
	cloro: 0.01,
	dataforseo: 0.005,
	"openai-api": 0.01,
	"anthropic-api": 0.01,
	"mistral-api": 0.005,
	openrouter: 0.005,
	stub: 0,
};

// The Anthropic estimate assumes Sonnet 5 pricing and a typical answer length.

/** Anthropic bills native web search per use (plus tokens); max_uses is 1. */
const ANTHROPIC_WEB_SEARCH_SURCHARGE_USD = 0.01;

export function estimateRunCostUsd(provider: string | null, webSearchEnabled: boolean): number | null {
	if (!provider) return null;
	const base = PROVIDER_COST_ESTIMATES_USD[provider];
	if (base === undefined) return null;
	if (provider === "anthropic-api" && webSearchEnabled) {
		return base + ANTHROPIC_WEB_SEARCH_SURCHARGE_USD;
	}
	return base;
}

/**
 * Real per-token prices, unlike the coarse per-event placeholders above: these
 * price a sentiment call from its token counts when the provider doesn't report
 * the call's billed cost (Gemini's OpenAI-compatible endpoint doesn't). The
 * enrichment spend ceiling enforces against the result, so they are list prices
 * in a public repo on purpose, as the one number that ceiling must get right.
 *
 * gemini-3.5-flash-lite, USD per million tokens, thinking billed as output:
 * twice Google's list price ($0.30 in, $2.50 out), so the ceiling errs strict.
 * An underestimate here would let real spend run past the cap; an overestimate
 * only stops it early. A pricier model needs this raised first.
 */
export const SENTIMENT_MODEL_PRICE_USD_PER_MTOK = { input: 0.6, output: 5 } as const;

export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
}

export function estimateTokenCostUsd(
	usage: TokenUsage,
	price: { input: number; output: number } = SENTIMENT_MODEL_PRICE_USD_PER_MTOK,
): number {
	return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}

/** Days per month used for cost projections — a flat 30, not a calendar month. */
export const PROJECTION_DAYS_PER_MONTH = 30;

/**
 * What one target costs to keep running for a month, at a brand's current
 * prompt count and cadence: every enabled prompt fires the target `runsPerDay`
 * times, each firing making `replication` provider calls.
 *
 * Self-hosted only. It exists to answer "what does adding this platform cost
 * me", so it inherits the coarseness of the per-provider estimates above and
 * should be presented as an estimate.
 */
export function projectMonthlyTargetCostUsd(input: {
	costPerRunUsd: number | null;
	enabledPrompts: number;
	runsPerDay: number;
	replication: number;
}): number | null {
	if (input.costPerRunUsd === null) return null;
	const runs = input.enabledPrompts * input.runsPerDay * input.replication * PROJECTION_DAYS_PER_MONTH;
	return input.costPerRunUsd * runs;
}
