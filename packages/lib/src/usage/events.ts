import { db } from "../db/db";
import type { DbConnection } from "../db/db-connection";
import { usageEvents } from "../db/schema";

/** Every usage_events type written, so a ceiling can count exactly its own. */
export type UsageEventType = "prompt_run" | "prompt_run_failed" | "sentiment-analysis";

export interface UsageEventInput {
	organizationId: string;
	brandId: string;
	promptId: string | null;
	eventType: UsageEventType;
	provider: string | null;
	model: string | null;
	webSearchEnabled?: boolean;
	estimatedCostUsd: number | null;
	inputTokens?: number | null;
	outputTokens?: number | null;
}

/**
 * Record one provider call. Throws on failure: a caller whose spend is capped
 * from these rows must not carry on after one fails to land, or the cap
 * undercounts. Callers that only attribute cost may catch.
 */
export async function recordUsageEvent(input: UsageEventInput, conn: DbConnection = db): Promise<void> {
	await conn.insert(usageEvents).values({
		organizationId: input.organizationId,
		brandId: input.brandId,
		promptId: input.promptId,
		eventType: input.eventType,
		provider: input.provider,
		model: input.model,
		webSearchEnabled: input.webSearchEnabled ?? false,
		units: 1,
		estimatedCostUsd: input.estimatedCostUsd === null ? null : input.estimatedCostUsd.toFixed(6),
		inputTokens: input.inputTokens ?? null,
		outputTokens: input.outputTokens ?? null,
	});
}
