import { SENTIMENT_QUEUE, SENTIMENT_QUEUE_OPTIONS } from "@workspace/lib/constants";
import {
	analyzeSentimentBatch,
	findSentimentBatches,
	type SentimentBatch,
	sentimentClassifier,
	sentimentModel,
} from "@workspace/lib/enrichment/sentiment";
import { enrichmentDailyCapUsd } from "@workspace/lib/usage/ceiling";
import type { Job } from "pg-boss";
import { getBoss } from "../boss";

export async function analyzeSentimentJob(jobs: Job<SentimentBatch>[]): Promise<void> {
	for (const job of jobs) {
		const result = await analyzeSentimentBatch(job.data, {
			classify: sentimentClassifier,
			capUsd: enrichmentDailyCapUsd(),
			model: sentimentModel(),
		});
		console.log(
			`[analyze-sentiment] ${job.data.promptId} ${job.data.model} ${job.data.day}: ${result.calls} calls, ${result.cached} cached${result.stoppedAtCeiling ? ", stopped at the enrichment ceiling" : ""}`,
		);
	}
}

/** Two days, so a day's late runs and yesterday's are both covered. */
const SWEEP_DAYS = 2;

/** Queue a batch for every recent (prompt, model, day) with judgements still to make. */
export async function sentimentSweepJob(): Promise<void> {
	const boss = getBoss();
	const batches = await findSentimentBatches(SWEEP_DAYS);
	for (const batch of batches) {
		await boss.send(SENTIMENT_QUEUE, batch, {
			...SENTIMENT_QUEUE_OPTIONS,
			singletonKey: `${batch.promptId}:${batch.model}:${batch.day}`,
		});
	}
	console.log(`[sentiment-sweep] queued ${batches.length} batches`);
}
