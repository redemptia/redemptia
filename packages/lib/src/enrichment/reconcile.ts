import { asc, type SQL, sql } from "drizzle-orm";
import { db } from "../db/db";
import { brands } from "../db/schema";
import { subjectFingerprint } from "./analysis";
import { ANALYZER_VERSION } from "./prominence";
import { loadBrandSubjects, lockBrandAnalysis, writeRunAnalysis } from "./write";

export interface ReconcileOptions {
	/** Only this brand's runs; every brand when omitted. */
	brandId?: string;
	/** Runs read, analysed and written per transaction. */
	batchSize: number;
	/** Wait between batches, so a pass on a live deployment leaves the database to the scraper. */
	pauseMs: number;
	/** Count what would be done and write nothing. */
	dryRun: boolean;
	onProgress?: (progress: ReconcileProgress) => void;
	/** Stop between batches once aborted, such as when a job running the pass expires. */
	signal?: AbortSignal;
}

export interface ReconcileProgress {
	/** Runs given a current analysis by this pass. */
	analysed: number;
	/** Stale runs this pass has yet to reach. */
	remaining: number;
	/** Runs with no run_texts row, which can't be analysed until the run_texts backfill reaches them. */
	awaitingText: number;
}

/**
 * The read-layer contract's definition of a run that is not analysed, shared by
 * the reconciler and every reader so the two can't disagree. `rt` and `a` must
 * be the run's run_texts row and marker.
 */
export function isStale(fingerprint: string): SQL {
	return sql`(a.prompt_run_id IS NULL
		OR a.analyzer_version <> ${ANALYZER_VERSION}
		OR a.extractor_version <> rt.extractor_version
		OR a.subject_fingerprint <> ${fingerprint})`;
}

type StaleRun = {
	id: string;
	prompt_id: string;
	model: string;
	/** created_at as Postgres prints it, so the cursor keeps its microseconds. */
	cursor_at: string;
	text: string | null;
	extractor_version: number;
};

async function countBrand(brandId: string, fingerprint: string) {
	const { rows } = await db.execute<{ stale: number; awaiting: number }>(sql`
		SELECT
			count(*) FILTER (WHERE rt.prompt_run_id IS NOT NULL AND ${isStale(fingerprint)})::int AS stale,
			count(*) FILTER (WHERE rt.prompt_run_id IS NULL)::int AS awaiting
		FROM prompt_runs pr
		LEFT JOIN run_texts rt ON rt.prompt_run_id = pr.id
		LEFT JOIN run_mention_analyses a ON a.prompt_run_id = pr.id
		WHERE pr.brand_id = ${brandId}`);
	return rows[0] ?? { stale: 0, awaiting: 0 };
}

/**
 * One batch in one transaction, holding the brand's analysis lock, so it reads
 * subjects and stale runs only after any other writer of the brand has
 * committed.
 */
async function reconcileBatch(
	brandId: string,
	cursor: { at: string; id: string },
	batchSize: number,
): Promise<StaleRun[] | null> {
	return db.transaction(async (tx) => {
		await lockBrandAnalysis(tx, brandId);
		const subjects = await loadBrandSubjects(tx, brandId);
		if (!subjects) return null;
		const { rows } = await tx.execute<StaleRun>(sql`
			SELECT pr.id, pr.prompt_id, pr.model, pr.created_at::text AS cursor_at, rt.text, rt.extractor_version
			FROM prompt_runs pr
			JOIN run_texts rt ON rt.prompt_run_id = pr.id
			LEFT JOIN run_mention_analyses a ON a.prompt_run_id = pr.id
			WHERE pr.brand_id = ${brandId}
				AND (pr.created_at, pr.id) > (${cursor.at}::timestamptz, ${cursor.id}::uuid)
				AND ${isStale(subjectFingerprint(subjects))}
			ORDER BY pr.created_at, pr.id
			LIMIT ${batchSize}`);
		for (const run of rows) {
			await writeRunAnalysis(
				tx,
				{ id: run.id, promptId: run.prompt_id, model: run.model },
				run.text,
				run.extractor_version,
				subjects,
			);
		}
		return rows;
	});
}

/**
 * Give every stale run a current analysis, a batch at a time: runs never
 * analysed, analysed by older analyzer code, analysed from text that has since
 * been re-extracted, or analysed against a subject set the brand has since
 * changed. It reads run_texts, never raw_output.
 *
 * Resumable and idempotent: what still needs doing is read from the markers,
 * so stopping and running it again picks up where it left off, and a run that
 * is already current is never rewritten.
 */
export async function reconcileRunAnalyses(options: ReconcileOptions): Promise<ReconcileProgress> {
	const brandIds = options.brandId
		? [options.brandId]
		: (await db.select({ id: brands.id }).from(brands).orderBy(asc(brands.id))).map((row) => row.id);

	const progress: ReconcileProgress = { analysed: 0, remaining: 0, awaitingText: 0 };
	const existing: string[] = [];
	for (const brandId of brandIds) {
		const subjects = await loadBrandSubjects(db, brandId);
		if (!subjects) continue;
		existing.push(brandId);
		const counts = await countBrand(brandId, subjectFingerprint(subjects));
		progress.remaining += counts.stale;
		progress.awaitingText += counts.awaiting;
	}
	options.onProgress?.({ ...progress });
	if (options.dryRun) return progress;

	for (const brandId of existing) await reconcileBrand(brandId, options, progress);
	return progress;
}

/**
 * Walk one brand's stale runs in (created_at, id) order. The cursor only ever
 * moves forward, so a run that is still stale after its batch (its brand's
 * subjects changed mid-pass) can't hold the pass in a loop; the next pass for
 * that brand reaches it.
 */
async function reconcileBrand(brandId: string, options: ReconcileOptions, progress: ReconcileProgress) {
	let cursor = { at: "-infinity", id: "00000000-0000-0000-0000-000000000000" };
	for (;;) {
		if (options.signal?.aborted) return;
		const batch = await reconcileBatch(brandId, cursor, options.batchSize);
		if (!batch || batch.length === 0) return;
		progress.analysed += batch.length;
		progress.remaining = Math.max(0, progress.remaining - batch.length);
		options.onProgress?.({ ...progress });

		const last = batch[batch.length - 1];
		cursor = { at: last.cursor_at, id: last.id };
		if (batch.length < options.batchSize) return;
		if (options.pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, options.pauseMs));
	}
}
