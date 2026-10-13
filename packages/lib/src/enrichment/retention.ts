import { asc, sql } from "drizzle-orm";
import { db } from "../db/db";
import { brands } from "../db/schema";
import { lockBrandAnalysis } from "./write";

/**
 * The shortest retention allowed: a year and a day, so no fixed dashboard
 * preset (the longest is one year) ever reaches past the horizon.
 */
export const MIN_RETENTION_DAYS = 366;

/**
 * Days of mention analysis to keep, from ENRICHMENT_RETENTION_DAYS. Null — keep
 * everything — when it's unset, or not an integer of at least
 * MIN_RETENTION_DAYS: a mistyped value must never purge more than intended.
 */
export function retentionDays(env: Record<string, string | undefined> = process.env): number | null {
	const raw = env.ENRICHMENT_RETENTION_DAYS?.trim();
	if (!raw) return null;
	const value = Number(raw);
	if (!Number.isInteger(value) || value < MIN_RETENTION_DAYS) {
		console.error(
			`Ignoring ENRICHMENT_RETENTION_DAYS "${raw}": it must be a whole number of at least ${MIN_RETENTION_DAYS}. Nothing will be purged.`,
		);
		return null;
	}
	return value;
}

/**
 * The instant before which mention analysis is purged and no longer read or
 * rebuilt, or null when everything is kept. A run created exactly at the
 * horizon is retained.
 */
export function retentionHorizon(
	now: Date = new Date(),
	env: Record<string, string | undefined> = process.env,
): Date | null {
	const days = retentionDays(env);
	return days === null ? null : new Date(now.getTime() - days * 86_400_000);
}

export interface PurgeOptions {
	horizon: Date;
	/** Runs whose analysis is deleted per transaction. */
	batchSize: number;
	/** Count what would be purged and delete nothing. */
	dryRun: boolean;
	signal?: AbortSignal;
}

/**
 * Delete the stored mention analysis (run_subject_mentions rows and the
 * run_mention_analyses marker) of runs created before `horizon`. Runs, their
 * text and paid stance judgements are kept: judgements cost money to re-buy,
 * and the reconciler and every analysis read stop at the same horizon, so a
 * purged run is neither rebuilt nor read as unanalysed.
 *
 * Each batch holds the brand's analysis lock, so it can't interleave with a
 * reconciler pass or a live write for that brand.
 */
export async function purgeExpiredAnalysis(options: PurgeOptions): Promise<{ runs: number }> {
	const brandIds = (await db.select({ id: brands.id }).from(brands).orderBy(asc(brands.id))).map((row) => row.id);
	let runs = 0;
	for (const brandId of brandIds) {
		if (options.signal?.aborted) break;
		if (options.dryRun) {
			runs += await countExpired(brandId, options.horizon);
			continue;
		}
		for (;;) {
			if (options.signal?.aborted) break;
			const purged = await purgeBatch(brandId, options.horizon, options.batchSize);
			runs += purged;
			if (purged < options.batchSize) break;
		}
	}
	return { runs };
}

function expiredRuns(brandId: string, horizon: Date) {
	return sql`
		SELECT pr.id FROM prompt_runs pr
		WHERE pr.brand_id = ${brandId}
			AND pr.created_at < ${horizon.toISOString()}::timestamptz
			AND (EXISTS (SELECT 1 FROM run_mention_analyses a WHERE a.prompt_run_id = pr.id)
				OR EXISTS (SELECT 1 FROM run_subject_mentions m WHERE m.prompt_run_id = pr.id))`;
}

async function countExpired(brandId: string, horizon: Date): Promise<number> {
	const { rows } = await db.execute<{ runs: number }>(
		sql`SELECT count(*)::int AS runs FROM (${expiredRuns(brandId, horizon)}) expired`,
	);
	return rows[0]?.runs ?? 0;
}

async function purgeBatch(brandId: string, horizon: Date, batchSize: number): Promise<number> {
	return db.transaction(async (tx) => {
		await lockBrandAnalysis(tx, brandId);
		const { rows } = await tx.execute<{ id: string }>(sql`${expiredRuns(brandId, horizon)} LIMIT ${batchSize}`);
		if (rows.length === 0) return 0;
		const ids = sql.join(
			rows.map((row) => sql`${row.id}::uuid`),
			sql`, `,
		);
		await tx.execute(sql`DELETE FROM run_subject_mentions WHERE prompt_run_id IN (${ids})`);
		await tx.execute(sql`DELETE FROM run_mention_analyses WHERE prompt_run_id IN (${ids})`);
		return rows.length;
	});
}
