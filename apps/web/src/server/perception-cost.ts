/**
 * What perception costs a brand per month, with the inputs that produce the number, so the
 * figure can be checked rather than trusted. Every input is the one the worker actually uses:
 * the brand's enabled targets from SCRAPE_TARGETS, its cadence, and RUNS_PER_PROMPT.
 */
import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { getDeployment } from "@workspace/deployment";
import { getDefaultDelayHours, getRunsPerPrompt } from "@workspace/lib/constants";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { brands } from "@workspace/lib/db/schema";
import { selectTargetsForBrand } from "@workspace/lib/providers";
import { estimateRunCostUsd, PROJECTION_DAYS_PER_MONTH } from "@workspace/lib/usage";
import { eq } from "drizzle-orm";
import { FACT_PROMPT_START, promptHeadroom } from "@/server/perception-prompts-core";

/**
 * Elmo's own estimate of its judge's cost, from the CLI's setup text (`apps/cli/src/judge.ts`):
 * "very roughly $0.15–0.35 per 1,000 answers". It is the only published figure for Jev; our fact
 * checks are assumed to cost the same per answer, which nothing has measured yet.
 */
export const JUDGE_USD_PER_THOUSAND_ANSWERS = { low: 0.15, high: 0.35 } as const;
/** Our own daily ceiling on fact-check calls, per organization (`apps/worker/src/perception/budget.ts`). */
export const DAILY_FACT_CHECK_CEILING = 2_000;

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

export function estimatePerceptionCost(inputs: CostInputs, showsDollars: boolean): PerceptionCostEstimate {
	const assumed = inputs.factPrompts === 0 ? FACT_PROMPT_START : null;
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
		dailyCeiling: DAILY_FACT_CHECK_CEILING,
		showsDollars,
	};
}

/**
 * The brand's estimate. Dollars only for the person who pays the provider bills: in local mode.
 * Elmo's own cost projection draws the same line (`selfHostedCostBasis` in `platform-picks.ts`),
 * since in whitelabel the viewer is the agency's customer.
 */
export async function getPerceptionCostEstimate(conn: DbConnection, brandId: string): Promise<PerceptionCostEstimate> {
	const [brand] = await conn
		.select({ enabledModels: brands.enabledModels, delayOverrideHours: brands.delayOverrideHours })
		.from(brands)
		.where(eq(brands.id, brandId));
	if (!brand) throw new Error("Brand not found");
	const showsDollars = getDeployment().mode === "local";
	const targets = selectTargetsForBrand(parseScrapeTargets(process.env.SCRAPE_TARGETS), brand.enabledModels).map(
		(config) => ({
			model: config.model,
			costPerRunUsd: showsDollars ? estimateRunCostUsd(config.provider, config.webSearch) : null,
		}),
	);
	const { factPrompts } = await promptHeadroom(conn, brandId);
	return estimatePerceptionCost(
		{
			factPrompts,
			targets,
			intervalHours: brand.delayOverrideHours ?? getDefaultDelayHours(),
			replication: getRunsPerPrompt(),
		},
		showsDollars,
	);
}
