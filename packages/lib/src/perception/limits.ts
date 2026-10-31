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

/**
 * The most answers elmo's mention judge is allowed to judge for one organization in a UTC day. A backstop,
 * not a budget: a brand at the prompt cap judges about 2,000 answers a day, so steady state is a fifth
 * of it. It bounds a restart loop, a crashing worker, or a bulk reprocess (a 90-day history is days of
 * allowance at this rate) to about $2 an organization a day at elmo's own estimate of $0.15-0.35 per
 * 1,000 answers.
 */
export const DAILY_MENTION_JUDGE_CEILING = 10_000;
