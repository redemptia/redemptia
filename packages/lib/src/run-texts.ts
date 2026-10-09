import { createHash } from "node:crypto";
import { and, asc, count, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "./db/db";
import type { DbConnection } from "./db/db-connection";
import { promptRuns, runTexts } from "./db/schema";
import { answerTextOrNull, extractTextContent, TEXT_EXTRACTOR_VERSION } from "./text-extraction";

function runTextValues(promptRunId: string, textContent: unknown, source: "live" | "backfill") {
	const text = answerTextOrNull(textContent);
	return {
		promptRunId,
		text,
		contentHash: text === null ? null : createHash("sha256").update(text).digest("hex"),
		answerLength: text === null ? null : text.length,
		extractorVersion: TEXT_EXTRACTOR_VERSION,
		source,
	};
}

/**
 * The answer text a stored run's raw_output yields, the way the backfill reads it.
 * Stored runs may predate the provider column, so extraction falls back to the model.
 *
 * This is the generic re-reader, not each provider's own parse, so for the
 * providers in KNOWN_DIVERGENT_EXTRACTIONS it can differ from the text the run
 * was saved with. run-text-contract.test.ts holds the per-provider comparison.
 */
export function extractRunText(rawOutput: unknown, provider: string | null, model: string): string {
	return extractTextContent(rawOutput, provider ?? model);
}

interface StoredRun {
	provider: string | null;
	model: string;
	webSearchEnabled: boolean;
	rawOutput: unknown;
}

/** DataForSEO LLM Responses carry their answer in items[].sections; the LLM Scraper never does. */
function isDataforseoLlmResponse(rawOutput: unknown): boolean {
	const items = (rawOutput as any)?.tasks?.[0]?.result?.[0]?.items;
	return Array.isArray(items) && items.some((item: any) => Array.isArray(item?.sections));
}

/**
 * Provider paths where the backfill's re-extraction cannot faithfully reproduce
 * the text the provider parsed when the run was saved. run-text-contract.test.ts
 * pins each one as an expected failure. Their backfilled rows can hold different
 * text, or null where the live run had an answer.
 */
export const KNOWN_DIVERGENT_EXTRACTIONS: ReadonlyArray<{
	label: string;
	cause: string;
	matches: (run: StoredRun) => boolean;
}> = [
	{
		label: "brightdata chatbot datasets",
		cause:
			"the live parse can read response_raw, which is stripped before storage, and the re-reader prefers an ai_overview block the live parse ignores",
		matches: (run) => run.provider === "brightdata" && run.model !== "google-ai-overview",
	},
	{
		label: "mistral-api with web search",
		cause: "the live parse keeps outputs[].content when it is a plain string; the re-reader drops it",
		matches: (run) => run.provider === "mistral-api" && run.webSearchEnabled,
	},
	{
		label: "dataforseo LLM Scraper",
		cause:
			"an answer only in items[].markdown, with no top-level markdown or sources, is re-read as a SERP response and comes back empty",
		matches: (run) =>
			run.provider === "dataforseo" &&
			(run.model === "chatgpt" || run.model === "gemini") &&
			!isDataforseoLlmResponse(run.rawOutput),
	},
];

/**
 * Record a run's answer text. Call it in the same transaction as the run's
 * insert, so no run exists without its row. When the extractor produced no
 * answer the row is still written, with null text, so the run reads as
 * extracted-and-empty rather than pending.
 */
export async function insertRunText(conn: DbConnection, promptRunId: string, textContent: unknown): Promise<void> {
	await conn.insert(runTexts).values(runTextValues(promptRunId, textContent, "live"));
}

export interface BackfillOptions {
	/** Runs read and written per batch. Each batch holds its raw payloads in memory at once. */
	batchSize: number;
	/** Wait between batches, so a backfill on a live deployment leaves the database to the scraper. */
	pauseMs: number;
	/** Count what would be done and write nothing. */
	dryRun: boolean;
	onProgress?: (progress: BackfillProgress) => void;
	/** Called the first time a pass meets each of KNOWN_DIVERGENT_EXTRACTIONS. */
	onDivergent?: (divergence: { label: string; cause: string }) => void;
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
	/** Runs written on a path the backfill can't faithfully reconstruct, by KNOWN_DIVERGENT_EXTRACTIONS label. */
	divergent: Record<string, number>;
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
						source: sql`excluded.source`,
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

function backfillValues(run: StoredRun & { id: string }): RunTextValues {
	let extracted: unknown;
	try {
		extracted = extractRunText(run.rawOutput, run.provider, run.model);
	} catch {
		// A payload no extractor can read has no answer, the same as a sentinel.
		extracted = null;
	}
	return runTextValues(run.id, extracted, "backfill");
}

/** Count each run on a known-divergent path, reporting each path the first time a pass meets it. */
function noteDivergences(
	batch: StoredRun[],
	progress: BackfillProgress,
	onDivergent: BackfillOptions["onDivergent"],
): void {
	for (const run of batch) {
		const divergence = KNOWN_DIVERGENT_EXTRACTIONS.find((known) => known.matches(run));
		if (!divergence) continue;
		if (!(divergence.label in progress.divergent)) onDivergent?.(divergence);
		progress.divergent[divergence.label] = (progress.divergent[divergence.label] ?? 0) + 1;
	}
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

	const progress: BackfillProgress = {
		processed: 0,
		sentinel: 0,
		skipped: total - pending,
		remaining: pending,
		divergent: {},
	};
	options.onProgress?.({ ...progress, divergent: { ...progress.divergent } });
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
				webSearchEnabled: promptRuns.webSearchEnabled,
				rawOutput: promptRuns.rawOutput,
			})
			.from(promptRuns)
			.leftJoin(runTexts, eq(runTexts.promptRunId, promptRuns.id))
			.where(and(needsText, after === null ? undefined : gt(promptRuns.id, after)))
			.orderBy(asc(promptRuns.id))
			.limit(options.batchSize);
		if (batch.length === 0) break;

		noteDivergences(batch, progress, options.onDivergent);
		const written = await writeBatch(batch.map(backfillValues));
		for (const value of written) {
			if (value.text === null) progress.sentinel++;
			else progress.processed++;
		}
		progress.remaining = Math.max(0, progress.remaining - batch.length);
		options.onProgress?.({ ...progress, divergent: { ...progress.divergent } });

		after = batch[batch.length - 1].id;
		if (batch.length < options.batchSize) break;
		if (options.pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, options.pauseMs));
	}

	return progress;
}
