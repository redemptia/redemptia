import { createHash } from "node:crypto";
import { and, asc, count, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "./db/db";
import type { DbConnection } from "./db/db-connection";
import { promptRuns, runTexts } from "./db/schema";
import { answerTextOrNull, extractTextContent, TEXT_EXTRACTOR_VERSION } from "./text-extraction";

function runTextValues(promptRunId: string, textContent: unknown) {
	const text = answerTextOrNull(textContent);
	return {
		promptRunId,
		text,
		contentHash: text === null ? null : createHash("sha256").update(text).digest("hex"),
		answerLength: text === null ? null : text.length,
		extractorVersion: TEXT_EXTRACTOR_VERSION,
	};
}

/**
 * Record a run's answer text. Call it in the same transaction as the run's
 * insert, so no run exists without its row. When the extractor produced no
 * answer the row is still written, with null text, so the run reads as
 * extracted-and-empty rather than pending.
 */
export async function insertRunText(conn: DbConnection, promptRunId: string, textContent: unknown): Promise<void> {
	await conn.insert(runTexts).values(runTextValues(promptRunId, textContent));
}

export interface BackfillOptions {
	/** Runs read and written per batch. Each batch holds its raw payloads in memory at once. */
	batchSize: number;
	/** Wait between batches, so a backfill on a live deployment leaves the database to the scraper. */
	pauseMs: number;
	/** Count what would be done and write nothing. */
	dryRun: boolean;
	onProgress?: (progress: BackfillProgress) => void;
}

export interface BackfillProgress {
	/** Runs given a row with answer text. */
	processed: number;
	/** Runs given a row with null text, because extraction found no answer. */
	sentinel: number;
	/** Runs already at the current extractor version when the backfill started. */
	skipped: number;
	/** Runs still without a current row. */
	remaining: number;
}

type RunTextValues = ReturnType<typeof runTextValues>;

/** Postgres's foreign_key_violation, wherever drizzle wrapped it in the cause chain. */
function isForeignKeyViolation(error: unknown): boolean {
	for (let cause = error, depth = 0; cause && typeof cause === "object" && depth < 10; depth++) {
		if ((cause as { code?: string }).code === "23503") return true;
		cause = (cause as { cause?: unknown }).cause;
	}
	return false;
}

/**
 * Upsert one batch in a single statement, so each batch commits on its own.
 * A run deleted since the batch was read (its prompt deleted meanwhile) fails
 * the run_texts foreign key; drop those and write the rest rather than abort.
 */
async function writeBatch(values: RunTextValues[]): Promise<RunTextValues[]> {
	let pending = values;
	while (pending.length > 0) {
		try {
			await db
				.insert(runTexts)
				.values(pending)
				.onConflictDoUpdate({
					target: runTexts.promptRunId,
					set: {
						text: sql`excluded.text`,
						contentHash: sql`excluded.content_hash`,
						answerLength: sql`excluded.answer_length`,
						extractorVersion: sql`excluded.extractor_version`,
					},
					// Never overwrite a row newer logic already wrote.
					setWhere: lt(runTexts.extractorVersion, sql`excluded.extractor_version`),
				});
			return pending;
		} catch (error) {
			if (!isForeignKeyViolation(error)) throw error;
			const ids = pending.map((value) => value.promptRunId);
			const alive = await db.select({ id: promptRuns.id }).from(promptRuns).where(inArray(promptRuns.id, ids));
			const aliveIds = new Set(alive.map((row) => row.id));
			if (aliveIds.size === pending.length) throw error;
			pending = pending.filter((value) => aliveIds.has(value.promptRunId));
		}
	}
	return pending;
}

/** A run needs (re-)extracting when it has no row, or one from older extraction logic. */
const needsText = or(isNull(runTexts.promptRunId), lt(runTexts.extractorVersion, TEXT_EXTRACTOR_VERSION));

/**
 * Write a run_texts row for every prompt run that lacks a current one, a batch at
 * a time, re-extracting the answer from the run's stored raw_output.
 *
 * Built for tables of large payloads: only the columns extraction needs are
 * read, raw_output only for one batch at a time, and each batch commits on its
 * own, so there is never one long transaction and an interrupted backfill resumes
 * by running it again. What still needs doing is read from run_texts itself, so
 * it is idempotent: current rows are skipped and older-version rows re-extracted.
 *
 * Runs that the worker saves while this is running already have their row; they
 * are written in the run's own transaction.
 */
export async function backfillRunTexts(options: BackfillOptions): Promise<BackfillProgress> {
	const [{ total }] = await db.select({ total: count() }).from(promptRuns);
	const [{ pending }] = await db
		.select({ pending: count() })
		.from(promptRuns)
		.leftJoin(runTexts, eq(runTexts.promptRunId, promptRuns.id))
		.where(needsText);

	const progress: BackfillProgress = { processed: 0, sentinel: 0, skipped: total - pending, remaining: pending };
	options.onProgress?.({ ...progress });
	if (options.dryRun) return progress;

	// Walk by id rather than re-asking "what still needs a row" from the start each
	// time, so a run whose write fails is not picked up again by the same pass.
	let after: string | null = null;
	for (;;) {
		const batch = await db
			.select({
				id: promptRuns.id,
				provider: promptRuns.provider,
				model: promptRuns.model,
				rawOutput: promptRuns.rawOutput,
			})
			.from(promptRuns)
			.leftJoin(runTexts, eq(runTexts.promptRunId, promptRuns.id))
			.where(and(needsText, after === null ? undefined : gt(promptRuns.id, after)))
			.orderBy(asc(promptRuns.id))
			.limit(options.batchSize);
		if (batch.length === 0) break;

		const values = batch.map((run) => {
			let extracted: unknown;
			try {
				// Stored runs may predate the provider column; extraction falls back to the model.
				extracted = extractTextContent(run.rawOutput, run.provider ?? run.model);
			} catch {
				// A payload no extractor can read has no answer, the same as a sentinel.
				extracted = null;
			}
			return runTextValues(run.id, extracted);
		});

		const written = await writeBatch(values);

		for (const value of written) {
			if (value.text === null) progress.sentinel++;
			else progress.processed++;
		}
		progress.remaining = Math.max(0, progress.remaining - batch.length);
		options.onProgress?.({ ...progress });

		after = batch[batch.length - 1].id;
		if (batch.length < options.batchSize) break;
		if (options.pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, options.pauseMs));
	}

	return progress;
}
