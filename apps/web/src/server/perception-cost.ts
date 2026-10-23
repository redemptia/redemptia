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
import { estimateRunCostUsd } from "@workspace/lib/usage";
import { eq } from "drizzle-orm";
import { estimatePerceptionCost, type PerceptionCostEstimate } from "@/lib/perception-cost";
import { FACT_PROMPT_START, promptHeadroom } from "@/server/perception-prompts-core";

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
		FACT_PROMPT_START,
	);
}
