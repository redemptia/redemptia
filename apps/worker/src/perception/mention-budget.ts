import { type AnalysisVersions, MENTIONS_KEY } from "@workspace/lib/analysis-versions";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { DAILY_MENTION_JUDGE_CEILING } from "@workspace/lib/perception/limits";
import { sql } from "drizzle-orm";

/**
 * Counts one answer against the brand's organization's allowance for today, and says whether elmo's mention
 * judge may judge it. One statement raises the count only while it is below the ceiling, so two workers
 * can't both take the last slot; a brand that doesn't exist gets no slot. Counted once per answer, not per
 * request, so a retry on a too-large answer isn't counted again.
 */
export async function reserveMentionCall(
	db: DbConnection,
	brandId: string,
	ceiling = DAILY_MENTION_JUDGE_CEILING,
): Promise<boolean> {
	const reserved = await db.execute(sql`
		INSERT INTO mention_judge_calls (organization_id, day, calls)
		SELECT organization_id, (now() AT TIME ZONE 'UTC')::date, 1 FROM brands WHERE id = ${brandId}
		ON CONFLICT (organization_id, day) DO UPDATE SET calls = mention_judge_calls.calls + 1
		WHERE mention_judge_calls.calls < ${ceiling}
		RETURNING calls`);
	return (Array.isArray(reserved) ? reserved : (reserved as { rows: unknown[] }).rows).length > 0;
}

/** Seconds until the next UTC day begins, and a minute past it: when refused work is tried again. */
export function secondsUntilTomorrow(now = new Date()): number {
	const tomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
	return Math.ceil((tomorrow - now.getTime()) / 1000) + 60;
}

/** The stub judge calls no one, so it has no allowance to spend. */
export const isPaidJudge = (judgeVersion: string) => !judgeVersion.startsWith("stub+");

/**
 * Splits runs into those elmo's mention judge may judge now and the ids it must leave for tomorrow: a run that
 * would call the paid judge takes a slot, and when the organization's allowance for today is used it is
 * refused. A run already at the current stamp, and the stub, take no slot.
 */
export async function splitByAllowance<T extends { id: string; stamps: AnalysisVersions }>(
	db: DbConnection,
	brandId: string,
	runs: T[],
	target: AnalysisVersions,
	judgeVersion: string,
): Promise<{ allowed: T[]; refused: string[] }> {
	const allowed: T[] = [];
	const refused: string[] = [];
	for (const run of runs) {
		const free = !isPaidJudge(judgeVersion) || run.stamps[MENTIONS_KEY] === target[MENTIONS_KEY];
		if (free || (await reserveMentionCall(db, brandId))) allowed.push(run);
		else refused.push(run.id);
	}
	return { allowed, refused };
}
