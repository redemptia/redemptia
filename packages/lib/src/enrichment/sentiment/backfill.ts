import { sql } from "drizzle-orm";
import { db } from "../../db/db";
import { estimateTokenCostUsd } from "../../usage/cost";
import type { Classifier } from "./classify";
import { analyzeSentimentBatch, type SentimentBatch } from "./judge";
import { SENTIMENT_ANALYZER_VERSION } from "./prompt";

export interface SentimentBackfillOptions {
	/** How far back to look, in days. */
	days: number;
	/** Only this brand's runs; every brand when omitted. */
	brandId?: string;
	/** Count and estimate only: no model call, no write. */
	dryRun: boolean;
	classify: Classifier;
	capUsd: number;
	model: string;
	/** Cost of one call for the estimate, ideally the eval's measured average. */
	costPerCallUsd?: number;
	onProgress?: (done: number, total: number) => void;
}

export interface SentimentBackfillResult {
	batches: number;
	/**
	 * Distinct answers with a subject still to judge, one paid call each, counted
	 * per batch: an answer repeated across days counts once per day, so this is
	 * an upper bound.
	 */
	callsNeeded: number;
	estimatedCostUsd: number;
	callsMade: number;
	/** Batches that stopped at an org's enrichment ceiling. */
	stoppedAtCeiling: number;
}

/** A call's cost when no measured average is supplied, priced high on a typical answer. */
const FALLBACK_COST_PER_CALL_USD = estimateTokenCostUsd({ inputTokens: 1500, outputTokens: 400 });

interface PendingWork {
	prompt_id: string;
	model: string;
	day: string;
	answers: number;
	[key: string]: unknown;
}

/**
 * The (prompt, model, day) batches with judgements still to make, and how many
 * distinct answers each would pay to judge. Same rules as the job: real answer
 * text only, at least one mentioned subject, no current judgement yet.
 */
async function pendingWork(days: number, brandId?: string): Promise<PendingWork[]> {
	const { rows } = await db.execute<PendingWork>(sql`
		SELECT pr.prompt_id::text AS prompt_id, pr.model, (pr.created_at AT TIME ZONE 'UTC')::date::text AS day,
			count(DISTINCT rt.content_hash)::int AS answers
		FROM prompt_runs pr
		JOIN run_texts rt ON rt.prompt_run_id = pr.id AND rt.text IS NOT NULL
		JOIN run_subject_mentions m ON m.prompt_run_id = pr.id
		LEFT JOIN stance_judgements j
			ON j.content_hash = rt.content_hash
			AND lower(btrim(j.subject_name)) = lower(btrim(m.subject_name))
			AND j.analyzer_version = ${SENTIMENT_ANALYZER_VERSION}
			AND j.status IN ('done', 'pending')
		WHERE pr.created_at > now() - make_interval(days => ${days})
			${brandId ? sql`AND pr.brand_id = ${brandId}` : sql``}
			AND j.id IS NULL
		GROUP BY 1, 2, 3
		ORDER BY 3, 1, 2`);
	return rows;
}

/**
 * Judge everything still unjudged in the window, batch by batch, under each
 * org's enrichment ceiling. A dry run only counts and estimates: it calls no
 * model and writes nothing.
 */
export async function backfillSentiment(options: SentimentBackfillOptions): Promise<SentimentBackfillResult> {
	const work = await pendingWork(options.days, options.brandId);
	const callsNeeded = work.reduce((n, w) => n + w.answers, 0);
	const result: SentimentBackfillResult = {
		batches: work.length,
		callsNeeded,
		estimatedCostUsd: callsNeeded * (options.costPerCallUsd ?? FALLBACK_COST_PER_CALL_USD),
		callsMade: 0,
		stoppedAtCeiling: 0,
	};
	if (options.dryRun) return result;

	for (const [i, w] of work.entries()) {
		const batch: SentimentBatch = { promptId: w.prompt_id, model: w.model, day: w.day };
		const done = await analyzeSentimentBatch(batch, {
			classify: options.classify,
			capUsd: options.capUsd,
			model: options.model,
		});
		result.callsMade += done.calls;
		if (done.stoppedAtCeiling) result.stoppedAtCeiling++;
		options.onProgress?.(i + 1, work.length);
	}
	return result;
}
