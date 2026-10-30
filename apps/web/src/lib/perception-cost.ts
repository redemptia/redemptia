/**
 * The arithmetic behind the perception cost estimate, kept free of server code so the page and its
 * stories can use it. Inputs come from `server/perception-cost.ts`.
 */
import { DAILY_JEV_CALL_CEILING } from "@workspace/lib/perception/limits";
import { PROJECTION_DAYS_PER_MONTH } from "@workspace/lib/usage";

/**
 * Elmo's own estimate of its judge's cost, from the CLI's setup text (`apps/cli/src/judge.ts`):
 * "very roughly $0.15–0.35 per 1,000 answers". It is the only published figure for Jev; our fact
 * checks are assumed to cost the same per answer, which nothing has measured yet.
 */
export const JUDGE_USD_PER_THOUSAND_ANSWERS = { low: 0.15, high: 0.35 } as const;

export interface CostTarget {
	model: string;
	/** Null when the deployment has no per-run estimate for the provider, or the viewer isn't the operator. */
	costPerRunUsd: number | null;
}

export interface CostInputs {
	factPrompts: number;
	targets: CostTarget[];
	/** How often each prompt runs on each model. */
	intervalHours: number;
	/** Provider calls per prompt, per model, per run. */
	replication: number;
}

export interface PerceptionCostEstimate {
	inputs: CostInputs;
	/** When the brand has no fact prompts yet, the estimate is for this many, and says so. */
	assumedFactPrompts: number | null;
	answersPerDay: number;
	answersPerMonth: number;
	/** Null when any target's per-run cost is unknown, or dollars aren't shown to this viewer. */
	providerUsdPerMonth: number | null;
	providerUsdPerPromptPerMonth: number | null;
	/** Elmo's mention judge runs on every answer that names a tracked company: these always name the brand. */
	mentionJudgeUsdPerMonth: { low: number; high: number };
	factChecksUsdPerMonth: { low: number; high: number };
	/** Fact checks a day against our ceiling. Over it, the rest wait for the next day. */
	factChecksPerDay: number;
	dailyCeiling: number;
	showsDollars: boolean;
}

export function estimatePerceptionCost(
	inputs: CostInputs,
	showsDollars: boolean,
	/** What to estimate for when the brand has no fact prompts yet. */
	startingPrompts = 10,
): PerceptionCostEstimate {
	const assumed = inputs.factPrompts === 0 ? startingPrompts : null;
	const prompts = assumed ?? inputs.factPrompts;
	const runsPerDay = 24 / Math.max(1, inputs.intervalHours);
	const answersPerPromptPerDay = inputs.targets.length * runsPerDay * inputs.replication;
	const answersPerDay = prompts * answersPerPromptPerDay;
	const answersPerMonth = answersPerDay * PROJECTION_DAYS_PER_MONTH;
	const costs = inputs.targets.map((target) => target.costPerRunUsd);
	const perPrompt =
		showsDollars && costs.every((cost) => cost !== null)
			? (costs as number[]).reduce((sum, cost) => sum + cost, 0) *
				runsPerDay *
				inputs.replication *
				PROJECTION_DAYS_PER_MONTH
			: null;
	const judged = (rate: number) => (answersPerMonth / 1000) * rate;
	const judge = { low: judged(JUDGE_USD_PER_THOUSAND_ANSWERS.low), high: judged(JUDGE_USD_PER_THOUSAND_ANSWERS.high) };
	return {
		inputs,
		assumedFactPrompts: assumed,
		answersPerDay,
		answersPerMonth,
		providerUsdPerMonth: perPrompt === null ? null : perPrompt * prompts,
		providerUsdPerPromptPerMonth: perPrompt,
		mentionJudgeUsdPerMonth: judge,
		factChecksUsdPerMonth: judge,
		factChecksPerDay: answersPerDay,
		dailyCeiling: DAILY_JEV_CALL_CEILING,
		showsDollars,
	};
}
