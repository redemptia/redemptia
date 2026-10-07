/** Tenancy is the caller's job: pass the `scope` fragment from
 * `brandScopeCondition`. */
import { db } from "@workspace/lib/db/db";
import { competitors } from "@workspace/lib/db/schema";
import { and, count, desc, eq, notInArray, type SQL, sql } from "drizzle-orm";

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
	scope?: SQL;
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
export async function setBrandCompetitors(brandId: string, list: CompetitorInput[]) {
	// One name listed twice has no single row to become.
	const names = list.map((c) => c.name);
	const repeated = names.find((name, i) => names.indexOf(name) !== i);
	if (repeated !== undefined) {
		throw new Error(`"${repeated}" is listed more than once.`);
	}

	return db.transaction(async (tx) => {
		await tx
			.delete(competitors)
			.where(and(eq(competitors.brandId, brandId), names.length > 0 ? notInArray(competitors.name, names) : undefined));

		if (list.length > 0) {
			await tx
				.insert(competitors)
				.values(list.map((c) => ({ brandId, name: c.name, domains: c.domains, aliases: c.aliases })))
				.onConflictDoUpdate({
					target: [competitors.brandId, competitors.name],
					set: { domains: sql`excluded.domains`, aliases: sql`excluded.aliases`, updatedAt: new Date() },
					// Leaves unchanged rows alone, so updated_at only moves when something changed.
					setWhere: sql`(${competitors.domains}, ${competitors.aliases}) is distinct from (excluded.domains, excluded.aliases)`,
				});
		}

		return tx.query.competitors.findMany({ where: eq(competitors.brandId, brandId) });
	});
}
