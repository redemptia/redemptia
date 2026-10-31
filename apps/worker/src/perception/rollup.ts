import type { DbConnection } from "@workspace/lib/db/db-connection";
import { perceptionRollupDirty } from "@workspace/lib/db/schema-perception";
import { and, asc, eq, sql } from "drizzle-orm";

/** Days rebuilt per job: a backlog clears over several minutes rather than holding the judge up. */
export const ROLLUP_DAYS_PER_JOB = 50;

export interface RollupOutcome {
	days: number;
	rows: number;
}

/**
 * Rebuilds `rollup_perception_daily` for every day the judge marked dirty. A day is rebuilt whole, from
 * its verdicts, in one transaction with clearing its marker: the old rows go, the new ones are written,
 * and only then does the marker go, so a failure leaves the marker for the next job and no half-built
 * day. Rebuilding the same day twice gives the same rows. Runs in the judge's own job, after the judge,
 * which is a singleton across workers, so no verdict arrives while a day is being rebuilt.
 *
 * Buckets are UTC days of the run's timestamp, one row per verdict value, counting each answer once.
 */
export async function buildPerceptionRollups(db: DbConnection, limit = ROLLUP_DAYS_PER_JOB): Promise<RollupOutcome> {
	const dirty = await db
		.select({ brandId: perceptionRollupDirty.brandId, day: perceptionRollupDirty.day })
		.from(perceptionRollupDirty)
		.orderBy(asc(perceptionRollupDirty.day), asc(perceptionRollupDirty.brandId))
		.limit(limit);
	const outcome: RollupOutcome = { days: 0, rows: 0 };
	for (const { brandId, day } of dirty) {
		outcome.rows += await db.transaction(async (tx) => {
			await tx.execute(sql`DELETE FROM rollup_perception_daily WHERE brand_id = ${brandId} AND day = ${day}::date`);
			const written = await tx.execute(sql`
				INSERT INTO rollup_perception_daily
					(brand_id, day, prompt_id, prompt_class, model, provider, subject, kind, ref_key, question_version, stamp, verdict, answers)
				SELECT r.brand_id, ${day}::date, r.prompt_id, pp.class, r.model, coalesce(r.provider, ''), v.subject, v.kind,
					coalesce(v.fact_id::text, a.key, ''), coalesce(v.question_version, 0), v.stamp, v.verdict, count(*)
				FROM perception_verdicts v
				JOIN prompt_runs r ON r.id = v.run_id
				JOIN perception_prompts pp ON pp.prompt_id = r.prompt_id
				LEFT JOIN perception_attributes a ON a.id = v.attribute_id
				WHERE r.brand_id = ${brandId} AND (r.created_at AT TIME ZONE 'UTC')::date = ${day}::date
				GROUP BY r.brand_id, r.prompt_id, pp.class, r.model, coalesce(r.provider, ''), v.subject, v.kind,
					coalesce(v.fact_id::text, a.key, ''), coalesce(v.question_version, 0), v.stamp, v.verdict`);
			await tx
				.delete(perceptionRollupDirty)
				.where(and(eq(perceptionRollupDirty.brandId, brandId), eq(perceptionRollupDirty.day, day)));
			return written.rowCount ?? 0;
		});
		outcome.days++;
	}
	return outcome;
}
