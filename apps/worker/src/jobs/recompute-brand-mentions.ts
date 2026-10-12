import { reconcileRunAnalyses } from "@workspace/lib/enrichment/reconcile";
import type { Job } from "pg-boss";

export interface RecomputeBrandMentionsData {
	brandId: string;
}

// Small batches with a pause between them, so a whole brand's recompute holds
// the brand's analysis lock only briefly at a time and leaves the database to
// the scraper in between.
const BATCH_SIZE = 100;
const PAUSE_MS = 100;

/**
 * Bring a brand's stored mention analysis up to date after its subjects changed.
 * Safe to retry or run twice: it rewrites only runs that are still stale.
 */
export async function recomputeBrandMentionsJob(jobs: Job<RecomputeBrandMentionsData>[]): Promise<void> {
	for (const job of jobs) {
		const { analysed } = await reconcileRunAnalyses({
			brandId: job.data.brandId,
			batchSize: BATCH_SIZE,
			pauseMs: PAUSE_MS,
			dryRun: false,
		});
		console.log(`[recompute-brand-mentions] ${job.data.brandId}: ${analysed} runs analysed`);
	}
}
