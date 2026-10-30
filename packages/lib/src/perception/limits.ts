/** Perception isn't priced for cloud, and the public demo is read-only. */
export const PERCEPTION_MODES = ["local", "whitelabel"] as const;

export function perceptionAvailableIn(mode: string): boolean {
	return (PERCEPTION_MODES as readonly string[]).includes(mode);
}

/**
 * The most Jev calls the perception job makes for one organization in a UTC day. It bounds a runaway
 * loop, not a budget: at 24 perception prompts a brand needs about 140 calls a day, and 2,000 calls
 * cost well under a dollar.
 */
export const DAILY_JEV_CALL_CEILING = 2_000;
