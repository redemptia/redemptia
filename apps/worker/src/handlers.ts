import * as Sentry from "@sentry/node";
import { getDeploymentFeatures } from "@workspace/deployment";
import {
	ANALYSIS_PURGE_QUEUE,
	MENTION_RECOMPUTE_QUEUE,
	SENTIMENT_QUEUE,
	SENTIMENT_SWEEP_QUEUE,
} from "@workspace/lib/constants";
import { type SentimentBatch, sentimentAvailable } from "@workspace/lib/enrichment/sentiment";
import type { OnboardingSuggestion } from "@workspace/lib/onboarding";
import type { Job, PgBoss } from "pg-boss";
import { type AnalyzeBrandData, analyzeBrandJob } from "./jobs/analyze-brand";
import { analyzeSentimentJob, sentimentSweepJob } from "./jobs/analyze-sentiment";
import { type GenerateReportData, generateReportJob } from "./jobs/generate-report";
import { type ProcessPromptData, processPromptJob } from "./jobs/process-prompt";
import { purgeExpiredAnalysisJob } from "./jobs/purge-expired-analysis";
import { type RecomputeBrandMentionsData, recomputeBrandMentionsJob } from "./jobs/recompute-brand-mentions";
import { type ScheduleMaintenanceData, scheduleMaintenanceJob } from "./jobs/schedule-maintenance";
import { type SyncAuth0MembershipsData, syncAuth0MembershipsJob } from "./jobs/sync-auth0-memberships";

/**
 * Wraps a pg-boss handler to report errors to Sentry before re-throwing.
 * Preserves the handler's return value (stored by pg-boss as the job output).
 */
function withSentry<T, R>(queueName: string, handler: (jobs: Job<T>[]) => Promise<R>): (jobs: Job<T>[]) => Promise<R> {
	return async (jobs) => {
		try {
			return await handler(jobs);
		} catch (error) {
			Sentry.withScope((scope) => {
				scope.setTag("queue", queueName);
				Sentry.captureException(error);
			});
			throw error;
		}
	};
}

/**
 * Register all job handlers with pg-boss.
 */
export async function registerHandlers(boss: PgBoss): Promise<void> {
	await boss.work<ProcessPromptData>(
		"process-prompt",
		{ localConcurrency: 10 },
		withSentry("process-prompt", processPromptJob),
	);
	console.log("Registered handler: process-prompt");

	if (getDeploymentFeatures().reportGeneration) {
		await boss.work<GenerateReportData>(
			"generate-report",
			{ localConcurrency: 2 },
			withSentry("generate-report", generateReportJob),
		);
		console.log("Registered handler: generate-report");
	}

	// batchSize: 1 keeps the returned suggestion mapped 1:1 to a single job's
	// output, which the web app reads back via getJobById.
	await boss.work<AnalyzeBrandData, OnboardingSuggestion>(
		"analyze-brand",
		{ batchSize: 1, localConcurrency: 2 },
		withSentry("analyze-brand", analyzeBrandJob),
	);
	console.log("Registered handler: analyze-brand");

	// One at a time per worker process, against process-prompt's ten. pg-boss
	// priority orders jobs only within a queue, so this cap is what bounds the
	// share of the worker and database a recompute takes from the scraper.
	if (getDeploymentFeatures().enrichment) {
		await boss.work<RecomputeBrandMentionsData>(
			MENTION_RECOMPUTE_QUEUE,
			{ batchSize: 1, localConcurrency: 1 },
			withSentry(MENTION_RECOMPUTE_QUEUE, recomputeBrandMentionsJob),
		);
		console.log(`Registered handler: ${MENTION_RECOMPUTE_QUEUE}`);
		await boss.work(
			ANALYSIS_PURGE_QUEUE,
			{ localConcurrency: 1 },
			withSentry(ANALYSIS_PURGE_QUEUE, purgeExpiredAnalysisJob),
		);
		console.log(`Registered handler: ${ANALYSIS_PURGE_QUEUE}`);
	}

	// Paid model calls: one batch at a time, and only where the analyzer has a
	// provider. Without one nothing is registered and nothing is queued.
	if (sentimentAvailable(getDeploymentFeatures())) {
		await boss.work<SentimentBatch>(
			SENTIMENT_QUEUE,
			{ batchSize: 1, localConcurrency: 1 },
			withSentry(SENTIMENT_QUEUE, analyzeSentimentJob),
		);
		await boss.work(
			SENTIMENT_SWEEP_QUEUE,
			{ localConcurrency: 1 },
			withSentry(SENTIMENT_SWEEP_QUEUE, sentimentSweepJob),
		);
		console.log(`Registered handlers: ${SENTIMENT_QUEUE}, ${SENTIMENT_SWEEP_QUEUE}`);
	}

	await boss.work<ScheduleMaintenanceData>(
		"schedule-maintenance",
		{ localConcurrency: 1 },
		withSentry("schedule-maintenance", scheduleMaintenanceJob),
	);
	console.log("Registered handler: schedule-maintenance");

	if (process.env.DEPLOYMENT_MODE === "whitelabel") {
		await boss.work<SyncAuth0MembershipsData>(
			"sync-auth0-memberships",
			{ localConcurrency: 1 },
			withSentry("sync-auth0-memberships", syncAuth0MembershipsJob),
		);
		console.log("Registered handler: sync-auth0-memberships");
	}
}
