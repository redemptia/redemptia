import { eq, type SQL, sql } from "drizzle-orm";
import { db } from "../../db/db";
import { brands, prompts } from "../../db/schema";
import { getOrgEntitlements } from "../../entitlements/service";
import { isOrgOverEnrichmentCeiling } from "../../usage/ceiling";
import { estimateTokenCostUsd } from "../../usage/cost";
import { recordUsageEvent } from "../../usage/events";
import { subjectFingerprint } from "../analysis";
import { isStale } from "../reconcile";
import { loadBrandSubjects } from "../write";
import { SENTIMENT_PROVIDER } from "./availability";
import type { Classifier, ClassifierResult } from "./classify";
import { SENTIMENT_ANALYZER_VERSION } from "./prompt";

/** One unit of work: every answer one prompt got from one model on one UTC day. */
export interface SentimentBatch {
	promptId: string;
	model: string;
	/** YYYY-MM-DD, UTC. */
	day: string;
}

export interface SentimentBatchResult {
	/** Paid calls made. */
	calls: number;
	/** Answers skipped because every subject in them was already judged or claimed. */
	cached: number;
	/** True when the batch stopped early at the org's enrichment ceiling. */
	stoppedAtCeiling: boolean;
	/** False when the org's plan doesn't include sentiment, so nothing was judged. */
	entitled: boolean;
}

/** A pending claim older than this is taken as abandoned (a crashed worker) and may be claimed again. */
const STALE_CLAIM_MINUTES = 30;

const normalise = (name: string) => name.trim().toLowerCase();

/**
 * A 10–30 word span that occurs verbatim in the answer, or null. Stored
 * evidence must be something the answer actually said.
 */
export function verbatimEvidence(answer: string, evidence: string): string | null {
	const span = evidence.trim();
	const words = span.split(/\s+/).filter(Boolean).length;
	if (words < 10 || words > 30) return null;
	return answer.includes(span) ? span : null;
}

interface Answer {
	content_hash: string;
	text: string;
	subject_names: string[];
	[key: string]: unknown;
}

/**
 * Answers in the batch worth paying to judge: real answer text (never a NULL
 * text run, which has nothing to judge) with at least one subject mentioned,
 * read from a current mention analysis, one entry per distinct answer so
 * replications share a single judgement.
 */
async function answersToJudge(batch: SentimentBatch, fingerprint: string): Promise<Answer[]> {
	const { rows } = await db.execute<Answer>(sql`
		SELECT rt.content_hash, min(rt.text) AS text, array_agg(DISTINCT m.subject_name) AS subject_names
		FROM prompt_runs pr
		JOIN run_texts rt ON rt.prompt_run_id = pr.id AND rt.text IS NOT NULL
		JOIN run_mention_analyses a ON a.prompt_run_id = pr.id
		JOIN run_subject_mentions m ON m.prompt_run_id = pr.id
		WHERE pr.prompt_id = ${batch.promptId}::uuid
			AND pr.model = ${batch.model}
			AND pr.created_at >= ${batch.day}::date::timestamp AT TIME ZONE 'UTC'
			AND pr.created_at < (${batch.day}::date + 1)::timestamp AT TIME ZONE 'UTC'
			AND NOT ${isStale(fingerprint)}
		GROUP BY rt.content_hash
		ORDER BY rt.content_hash`);
	return rows;
}

/**
 * Claim the (answer, subject) judgements nobody holds, returning the names
 * claimed. The unique key on (content_hash, lower(btrim(subject_name)),
 * analyzer_version) is what makes a duplicate paid call impossible: a second
 * job, or a retry, finds the row taken and claims nothing. Only failed claims
 * and long-abandoned pending ones are taken over.
 */
async function claim(contentHash: string, names: string[], model: string): Promise<string[]> {
	const values: SQL[] = names.map(
		(name) => sql`(${contentHash}, ${name}, ${SENTIMENT_ANALYZER_VERSION}, ${model}, 'pending')`,
	);
	const { rows } = await db.execute<{ subject_name: string }>(sql`
		INSERT INTO stance_judgements (content_hash, subject_name, analyzer_version, analyzer_model, status)
		VALUES ${sql.join(values, sql`, `)}
		ON CONFLICT (content_hash, lower(btrim(subject_name)), analyzer_version) DO UPDATE
			SET status = 'pending', analyzer_model = excluded.analyzer_model, updated_at = now()
			WHERE stance_judgements.status = 'failed'
				OR (stance_judgements.status = 'pending'
					AND stance_judgements.updated_at < now() - make_interval(mins => ${STALE_CLAIM_MINUTES}))
		RETURNING subject_name`);
	return rows.map((row) => row.subject_name);
}

async function markFailed(contentHash: string, names: string[]): Promise<void> {
	if (names.length === 0) return;
	await db.execute(sql`
		UPDATE stance_judgements SET status = 'failed', updated_at = now()
		WHERE content_hash = ${contentHash} AND analyzer_version = ${SENTIMENT_ANALYZER_VERSION}
			AND lower(btrim(subject_name)) IN (${sql.join(
				names.map((name) => sql`${normalise(name)}`),
				sql`, `,
			)})`);
}

/**
 * Store a call's judgements and its cost in one transaction, so a paid call
 * never lands without the usage row the ceiling counts. A claimed subject the
 * model didn't return is marked failed, to be claimed again.
 */
async function store(
	answer: Answer,
	claimed: string[],
	result: ClassifierResult,
	owner: { organizationId: string; brandId: string; promptId: string },
): Promise<void> {
	const byName = new Map(result.judgements.map((j) => [normalise(j.subject), j]));
	await db.transaction(async (tx) => {
		for (const name of claimed) {
			const judgement = byName.get(normalise(name));
			if (!judgement) {
				await tx.execute(sql`
					UPDATE stance_judgements SET status = 'failed', updated_at = now()
					WHERE content_hash = ${answer.content_hash} AND analyzer_version = ${SENTIMENT_ANALYZER_VERSION}
						AND lower(btrim(subject_name)) = ${normalise(name)}`);
				continue;
			}
			const confidence = Math.min(1, Math.max(0, judgement.confidence));
			await tx.execute(sql`
				UPDATE stance_judgements
				SET status = 'done', stance = ${judgement.stance}, role = ${judgement.role},
					confidence = ${confidence}, evidence = ${verbatimEvidence(answer.text, judgement.evidence)},
					analyzer_model = ${result.model}, updated_at = now()
				WHERE content_hash = ${answer.content_hash} AND analyzer_version = ${SENTIMENT_ANALYZER_VERSION}
					AND lower(btrim(subject_name)) = ${normalise(name)}`);
		}
		await recordUsageEvent(
			{
				...owner,
				eventType: "sentiment-analysis",
				provider: SENTIMENT_PROVIDER,
				model: result.model,
				// The provider's billed figure when it gives one; otherwise priced
				// from tokens at a deliberately high rate, so the ceiling errs strict.
				estimatedCostUsd: result.usage.costUsd ?? estimateTokenCostUsd(result.usage),
				inputTokens: result.usage.inputTokens,
				outputTokens: result.usage.outputTokens,
			},
			tx,
		);
	});
}

/**
 * Judge every unjudged (answer, subject) pair in a batch, one paid call per
 * distinct answer, checking the org's enrichment ceiling before each call, and
 * none at all for an org whose plan doesn't include sentiment. It never runs
 * inside withQuotaLock: a model call holds nothing but its own
 * claim. Safe to retry: judged and claimed pairs are skipped by the unique key.
 */
export async function analyzeSentimentBatch(
	batch: SentimentBatch,
	deps: { classify: Classifier; capUsd: number; model: string },
): Promise<SentimentBatchResult> {
	const result: SentimentBatchResult = { calls: 0, cached: 0, stoppedAtCeiling: false, entitled: true };
	const [owner] = await db
		.select({ brandId: prompts.brandId, organizationId: brands.organizationId })
		.from(prompts)
		.innerJoin(brands, eq(brands.id, prompts.brandId))
		.where(eq(prompts.id, batch.promptId));
	if (!owner) return result;
	// Checked here rather than in the sweep, so the backfill can't spend on a
	// plan without sentiment either.
	if (!(await getOrgEntitlements(owner.organizationId)).sentimentAnalysis) {
		result.entitled = false;
		return result;
	}
	const subjects = await loadBrandSubjects(db, owner.brandId);
	if (!subjects) return result;

	for (const answer of await answersToJudge(batch, subjectFingerprint(subjects))) {
		if (await isOrgOverEnrichmentCeiling(owner.organizationId, deps.capUsd)) {
			result.stoppedAtCeiling = true;
			break;
		}
		const names = [...new Map(answer.subject_names.map((n) => [normalise(n), n])).values()];
		const claimed = await claim(answer.content_hash, names, deps.model);
		if (claimed.length === 0) {
			result.cached++;
			continue;
		}
		let judged: ClassifierResult;
		try {
			judged = await deps.classify(answer.text, claimed);
		} catch (error) {
			await markFailed(answer.content_hash, claimed);
			throw error;
		}
		result.calls++;
		await store(answer, claimed, judged, { ...owner, promptId: batch.promptId });
	}
	return result;
}

/**
 * Batches with work left: recent (prompt, model, day) groups holding a
 * mentioned subject in a real answer that no current-version judgement covers
 * yet. Feeds the scheduled sweep that queues the sentiment job.
 */
export async function findSentimentBatches(sinceDays: number): Promise<SentimentBatch[]> {
	const { rows } = await db.execute<{ prompt_id: string; model: string; day: string }>(sql`
		SELECT DISTINCT pr.prompt_id::text AS prompt_id, pr.model, (pr.created_at AT TIME ZONE 'UTC')::date::text AS day
		FROM prompt_runs pr
		JOIN run_texts rt ON rt.prompt_run_id = pr.id AND rt.text IS NOT NULL
		JOIN run_subject_mentions m ON m.prompt_run_id = pr.id
		LEFT JOIN stance_judgements j
			ON j.content_hash = rt.content_hash
			AND lower(btrim(j.subject_name)) = lower(btrim(m.subject_name))
			AND j.analyzer_version = ${SENTIMENT_ANALYZER_VERSION}
			AND j.status IN ('done', 'pending')
		WHERE pr.created_at > now() - make_interval(days => ${sinceDays})
			AND j.id IS NULL`);
	return rows.map((row) => ({ promptId: row.prompt_id, model: row.model, day: row.day }));
}
