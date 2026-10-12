import { eq, sql } from "drizzle-orm";
import type { DbConnection } from "../db/db-connection";
import { brands, competitors, promptRuns, runMentionAnalyses, runSubjectMentions } from "../db/schema";
import { type AnalysisSubject, analyzeRun, brandSubjects, subjectFingerprint } from "./analysis";
import { ANALYZER_VERSION } from "./prominence";

export interface AnalysedRun {
	id: string;
	promptId: string;
	model: string;
}

/**
 * Serialise every writer of one brand's analysis until its transaction ends.
 * Take it before loading subjects: under READ COMMITTED each statement after the
 * wait sees what the writer ahead committed, so a writer can never stamp a run
 * with a subject set older than one already written. A row lock can't do this,
 * because a query that waited on it keeps the rows and markers it saw before.
 */
export async function lockBrandAnalysis(conn: DbConnection, brandId: string): Promise<void> {
	await conn.execute(sql`select pg_advisory_xact_lock(hashtext('run-mention-analysis'), hashtext(${brandId}))`);
}

/** A brand's subjects, or null if the brand is gone. */
export async function loadBrandSubjects(conn: DbConnection, brandId: string): Promise<AnalysisSubject[] | null> {
	const [brand] = await conn.select().from(brands).where(eq(brands.id, brandId));
	if (!brand) return null;
	const brandCompetitors = await conn.select().from(competitors).where(eq(competitors.brandId, brandId));
	return brandSubjects(brand, brandCompetitors);
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
				// Read from the run itself: a JS Date would drop its microseconds.
				createdAt: sql`(SELECT ${promptRuns.createdAt} FROM ${promptRuns} WHERE ${promptRuns.id} = ${run.id})`,
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
 * as saving a run that was already paid for. Pass the caller's transaction: the
 * write runs in a savepoint of it, because a failed statement would otherwise
 * abort the whole transaction and a plain catch can't undo that. On failure
 * nothing is written, so the run reads as not analysed.
 */
export async function tryWriteRunAnalysis(
	tx: DbConnection,
	run: AnalysedRun & { brandId: string },
	text: string | null,
	extractorVersion: number,
	onError: (error: unknown) => void,
): Promise<boolean> {
	try {
		await tx.transaction(async (savepoint) => {
			await lockBrandAnalysis(savepoint, run.brandId);
			const subjects = await loadBrandSubjects(savepoint, run.brandId);
			if (!subjects) throw new Error(`Brand ${run.brandId} not found`);
			await writeRunAnalysis(savepoint, run, text, extractorVersion, subjects);
		});
		return true;
	} catch (error) {
		try {
			onError(error);
		} catch {
			// Reporting the failure must not become a way to fail the run.
		}
		return false;
	}
}
