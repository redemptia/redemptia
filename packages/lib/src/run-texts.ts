import { createHash } from "node:crypto";
import type { DbConnection } from "./db/db-connection";
import { runTexts } from "./db/schema";
import { answerTextOrNull, TEXT_EXTRACTOR_VERSION } from "./text-extraction";

/**
 * Record a run's answer text. Call it in the same transaction as the run's
 * insert, so no run exists without its row. When the extractor produced no
 * answer the row is still written, with null text, so the run reads as
 * extracted-and-empty rather than pending.
 */
export async function insertRunText(conn: DbConnection, promptRunId: string, textContent: unknown): Promise<void> {
	const text = answerTextOrNull(textContent);
	await conn.insert(runTexts).values({
		promptRunId,
		text,
		contentHash: text === null ? null : createHash("sha256").update(text).digest("hex"),
		answerLength: text === null ? null : text.length,
		extractorVersion: TEXT_EXTRACTOR_VERSION,
	});
}
