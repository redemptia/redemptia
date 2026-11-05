export const RUNS_PER_PROMPT_FALLBACK = 5;

/**
 * Answers vary between identical calls, so sampling several makes a mention rate
 * a measurement, at that multiple of provider spend. Outside cloud only; cloud
 * takes it from the plan. Server-only.
 */
export function getRunsPerPrompt(): number {
	const raw = typeof process !== "undefined" ? process.env.RUNS_PER_PROMPT : undefined;
	if (!raw) return RUNS_PER_PROMPT_FALLBACK;
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed < 1) return RUNS_PER_PROMPT_FALLBACK;
	return parsed;
}

export const DEFAULT_DELAY_HOURS_FALLBACK = 24;

/** Server-only; client code reads clientConfig.defaultDelayHours. */
export function getDefaultDelayHours(): number {
	const raw = typeof process !== "undefined" ? process.env.DEFAULT_DELAY_HOURS : undefined;
	if (!raw) return DEFAULT_DELAY_HOURS_FALLBACK;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DELAY_HOURS_FALLBACK;
	return parsed;
}

/**
 * DAILY_PROVIDER_CALL_CEILING: provider calls an unmetered organization may make in 24 hours, replacing the
 * ceiling derived from its prompts and targets. Unset, zero or unparseable means the derived one.
 * Server-only, like getRunsPerPrompt.
 */
export function getDailyProviderCallCeiling(): number | null {
	const raw = typeof process !== "undefined" ? process.env.DAILY_PROVIDER_CALL_CEILING : undefined;
	const parsed = Number(raw);
	return raw && Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

// Maximum limits for brand resources
export const MAX_COMPETITORS = 500;
export const MAX_PROMPTS = 100;

export const PROMPT_SUGGESTION_RUNS_PER_DAY = 5;

/** For a search that happened but whose query strings the provider withholds. Fan-out reads filter it out. */
export const WEB_QUERIES_UNAVAILABLE = "unavailable";
