import { purgeExpiredAnalysis, retentionHorizon } from "@workspace/lib/enrichment/retention";
import type { Job } from "pg-boss";

const BATCH_SIZE = 1000;

/**
 * Delete stored mention analysis older than ENRICHMENT_RETENTION_DAYS. Checks
 * the horizon itself rather than trusting the schedule, so a schedule left
 * behind after retention is switched off deletes nothing.
 */
export async function purgeExpiredAnalysisJob(jobs: Job[]): Promise<void> {
	for (const job of jobs) {
		const horizon = retentionHorizon();
		if (!horizon) {
			console.log("[purge-expired-analysis] retention is off; nothing purged");
			continue;
		}
		const { runs } = await purgeExpiredAnalysis({ horizon, batchSize: BATCH_SIZE, dryRun: false, signal: job.signal });
		console.log(`[purge-expired-analysis] purged the analysis of ${runs} runs created before ${horizon.toISOString()}`);
	}
}
