import { eq } from "drizzle-orm";
import type { DbConnection } from "../db/db-connection";
import { runMentionAnalyses, runSubjectMentions } from "../db/schema";
import { type AnalysisSubject, analyzeRun, subjectFingerprint } from "./analysis";
import { ANALYZER_VERSION } from "./prominence";

export interface AnalysedRun {
	id: string;
	promptId: string;
	model: string;
	createdAt: Date;
}

/**
 * Replace a run's stored analysis with one computed from `text`, the run's
 * run_texts text at `extractorVersion`. Call it in a transaction: the mention
 * rows and the marker that makes their absence meaningful must commit together.
 */
export async function writeRunAnalysis(
	conn: DbConnection,
	run: AnalysedRun,
	text: string | null,
	extractorVersion: number,
	subjects: readonly AnalysisSubject[],
): Promise<void> {
	const rows = analyzeRun(text, subjects);
	await conn.delete(runSubjectMentions).where(eq(runSubjectMentions.promptRunId, run.id));
	if (rows.length > 0) {
		await conn.insert(runSubjectMentions).values(
			rows.map((row) => ({
				...row,
				promptRunId: run.id,
				promptId: run.promptId,
				model: run.model,
				createdAt: run.createdAt,
			})),
		);
	}
	const marker = {
		analyzerVersion: ANALYZER_VERSION,
		extractorVersion,
		subjectFingerprint: subjectFingerprint(subjects),
	};
	await conn
		.insert(runMentionAnalyses)
		.values({ promptRunId: run.id, ...marker })
		.onConflictDoUpdate({ target: runMentionAnalyses.promptRunId, set: marker });
}

/**
 * writeRunAnalysis for a caller whose transaction must commit regardless, such
 * as saving a run that was already paid for. It runs in a savepoint: a failed
 * statement would otherwise abort the caller's whole transaction, and a plain
 * catch can't undo that. On failure nothing is written, so the run reads as not
 * analysed and the backfill picks it up.
 */
export async function tryWriteRunAnalysis(
	tx: DbConnection,
	run: AnalysedRun,
	text: string | null,
	extractorVersion: number,
	subjects: readonly AnalysisSubject[],
	onError: (error: unknown) => void,
): Promise<boolean> {
	try {
		await tx.transaction((savepoint) => writeRunAnalysis(savepoint, run, text, extractorVersion, subjects));
		return true;
	} catch (error) {
		onError(error);
		return false;
	}
}
