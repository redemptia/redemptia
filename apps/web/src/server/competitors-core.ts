/** Tenancy is the caller's job: pass the `scope` fragment from
 * `brandScopeCondition`. */
import { db } from "@workspace/lib/db/db";
import { competitors } from "@workspace/lib/db/schema";
import { competitorNameKey } from "@workspace/lib/db/unique-names";
import { and, count, desc, eq, type SQL, sql } from "drizzle-orm";

const COMPETITOR_COLUMNS = {
	id: competitors.id,
	brandId: competitors.brandId,
	name: competitors.name,
	domains: competitors.domains,
	aliases: competitors.aliases,
	createdAt: competitors.createdAt,
	updatedAt: competitors.updatedAt,
} as const;

export type CompetitorSummary = {
	[K in keyof typeof COMPETITOR_COLUMNS]: (typeof competitors.$inferSelect)[K];
};

export interface ListCompetitorsFilters {
	brandId?: string;
	limit?: number;
	offset?: number;
	/** Required so a caller can't forget it; nullable because an admin principal
	 * has no condition and `brandScopeCondition` returns undefined for it. */
	scope: SQL | undefined;
}

export async function listCompetitors(
	filters: ListCompetitorsFilters,
): Promise<{ data: CompetitorSummary[]; total: number }> {
	const conditions: (SQL | undefined)[] = [filters.scope];
	if (filters.brandId) conditions.push(eq(competitors.brandId, filters.brandId));

	const where = and(...conditions.filter(Boolean));
	const [totals] = await db.select({ count: count() }).from(competitors).where(where);
	let query = db
		.select(COMPETITOR_COLUMNS)
		.from(competitors)
		.where(where)
		.orderBy(desc(competitors.createdAt))
		.$dynamic();
	if (filters.limit !== undefined) query = query.limit(filters.limit).offset(filters.offset ?? 0);
	const data = await query;

	return { data, total: totals?.count ?? 0 };
}

export interface CompetitorInput {
	name: string;
	domains: string[];
	aliases: string[];
}

/**
 * Set a brand's competitors to exactly `list`. Inputs are expected cleaned and
 * the caller is expected to have checked access and the competitor cap.
 *
 * Diffs against the stored set rather than replacing it: deleting and
 * re-inserting gives every competitor a new id, orphaning anything keyed on one.
 * Names are the match key, so a competitor whose name is unchanged keeps its row
 * and id, only names that left the list are deleted, and new names are inserted.
 */
/** A text[] literal: drizzle would spread a bare JS array into separate parameters. */
function textArray(values: string[]): SQL {
	return values.length === 0
		? sql`'{}'::text[]`
		: sql`ARRAY[${sql.join(
				values.map((value) => sql`${value}`),
				sql`, `,
			)}]::text[]`;
}

export async function setBrandCompetitors(brandId: string, list: CompetitorInput[]) {
	// One name listed twice, even in another case, has no single row to become.
	const keys = list.map((c) => competitorNameKey(c.name));
	const repeated = list.find((_, i) => keys.indexOf(keys[i]) !== i);
	if (repeated !== undefined) {
		throw new Error(`"${repeated.name}" is listed more than once.`);
	}

	return db.transaction(async (tx) => {
		await tx.delete(competitors).where(
			and(
				eq(competitors.brandId, brandId),
				list.length > 0
					? sql`lower(btrim(${competitors.name})) NOT IN (${sql.join(
							list.map((c) => sql`lower(btrim(${c.name}))`),
							sql`, `,
						)})`
					: undefined,
			),
		);

		if (list.length > 0) {
			// Raw SQL because drizzle's conflict target takes only columns, and this
			// one is the (brand_id, lower(btrim(name))) expression index. A case-only
			// rename lands on the same row, keeping its id, and stores the new spelling.
			const rows = list.map((c) => sql`(${brandId}, ${c.name}, ${textArray(c.domains)}, ${textArray(c.aliases)})`);
			await tx.execute(sql`
				INSERT INTO competitors (brand_id, name, domains, aliases)
				VALUES ${sql.join(rows, sql`, `)}
				ON CONFLICT (brand_id, lower(btrim(name))) DO UPDATE
				SET name = excluded.name, domains = excluded.domains, aliases = excluded.aliases, updated_at = now()
				-- Leaves unchanged rows alone, so updated_at only moves when something changed.
				WHERE (competitors.name, competitors.domains, competitors.aliases)
					IS DISTINCT FROM (excluded.name, excluded.domains, excluded.aliases)`);
		}

		return tx.query.competitors.findMany({ where: eq(competitors.brandId, brandId) });
	});
}
