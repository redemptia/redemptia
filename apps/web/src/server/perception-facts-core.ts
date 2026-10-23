/**
 * Brand facts and the perception switch. Facts are dated records, never edited: a change is a new
 * record that supersedes the old one, which ends the day before. Exactly one version of a fact is
 * true on any day, so the judge never checks an answer against two versions of the same fact.
 *
 * Every function takes the brand id the caller has already authorized, and scopes every read and
 * write to it.
 */
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { brandFacts, perceptionBrandSettings, perceptionVerdicts } from "@workspace/lib/db/schema-perception";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { MAX_ACTIVE_FACTS, normalizeStatement, statementProblem } from "@/lib/fact-statement";

/** A rule the user broke; its message is shown to them as written. */
export class FactRuleError extends Error {}

export interface FactRecord {
	id: string;
	statement: string;
	category: string | null;
	validFrom: string;
	validTo: string | null;
	supersedes: string | null;
	supersededBy: string | null;
	judged: boolean;
}

/** `YYYY-MM-DD` arithmetic in UTC, the zone fact dates and run days are compared in. */
export function addDays(day: string, days: number): string {
	const date = new Date(`${day}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

export function utcToday(): string {
	return new Date().toISOString().slice(0, 10);
}

export async function isPerceptionEnabled(db: DbConnection, brandId: string): Promise<boolean> {
	const [row] = await db
		.select({ enabled: perceptionBrandSettings.enabled })
		.from(perceptionBrandSettings)
		.where(eq(perceptionBrandSettings.brandId, brandId));
	return row?.enabled ?? false;
}

export async function setPerceptionEnabled(db: DbConnection, brandId: string, enabled: boolean): Promise<void> {
	await db
		.insert(perceptionBrandSettings)
		.values({ brandId, enabled })
		.onConflictDoUpdate({ target: perceptionBrandSettings.brandId, set: { enabled, updatedAt: sql`now()` } });
}

export async function listFacts(db: DbConnection, brandId: string): Promise<FactRecord[]> {
	const next = alias(brandFacts, "next");
	return db
		.select({
			id: brandFacts.id,
			statement: brandFacts.statement,
			category: brandFacts.category,
			validFrom: sql<string>`${brandFacts.validFrom}::text`,
			validTo: sql<string | null>`${brandFacts.validTo}::text`,
			supersedes: brandFacts.supersedes,
			supersededBy: next.id,
			judged: sql<boolean>`EXISTS (SELECT 1 FROM ${perceptionVerdicts} WHERE ${perceptionVerdicts.factId} = ${brandFacts.id})`,
		})
		.from(brandFacts)
		.leftJoin(next, eq(next.supersedes, brandFacts.id))
		.where(eq(brandFacts.brandId, brandId))
		.orderBy(asc(brandFacts.validFrom), asc(brandFacts.createdAt));
}

/**
 * Runs `work` holding this brand's row in our own settings table, so two writes for one brand (two
 * adds racing past the cap, say) happen one after the other.
 */
async function forBrand<T>(db: DbConnection, brandId: string, work: (tx: DbConnection) => Promise<T>): Promise<T> {
	return db.transaction(async (tx) => {
		await tx.insert(perceptionBrandSettings).values({ brandId }).onConflictDoNothing();
		await tx.execute(
			sql`SELECT 1 FROM ${perceptionBrandSettings} WHERE ${perceptionBrandSettings.brandId} = ${brandId} FOR UPDATE`,
		);
		return work(tx);
	});
}

async function activeFacts(tx: DbConnection, brandId: string) {
	return tx
		.select({ id: brandFacts.id, statement: brandFacts.statement })
		.from(brandFacts)
		.where(and(eq(brandFacts.brandId, brandId), isNull(brandFacts.validTo)));
}

function checkStatement(statement: string): string {
	const problem = statementProblem(statement);
	if (problem) throw new FactRuleError(problem);
	return normalizeStatement(statement);
}

function checkNotFuture(day: string, today: string, what: string) {
	if (day > today) throw new FactRuleError(`${what} can't be in the future.`);
}

function duplicateOf(statement: string, active: { id: string; statement: string }[], except?: string) {
	const key = statement.toLowerCase();
	return active.find((fact) => fact.id !== except && normalizeStatement(fact.statement).toLowerCase() === key);
}

async function lockedFact(tx: DbConnection, brandId: string, factId: string) {
	const [fact] = await tx
		.select()
		.from(brandFacts)
		.where(and(eq(brandFacts.id, factId), eq(brandFacts.brandId, brandId)))
		.for("update");
	if (!fact) throw new FactRuleError("That fact doesn't exist.");
	return fact;
}

export async function addFact(
	db: DbConnection,
	brandId: string,
	input: { statement: string; category?: string | null; validFrom: string },
	today = utcToday(),
): Promise<string> {
	const statement = checkStatement(input.statement);
	checkNotFuture(input.validFrom, today, "The date a fact became true");
	return forBrand(db, brandId, async (tx) => {
		const active = await activeFacts(tx, brandId);
		if (active.length >= MAX_ACTIVE_FACTS) {
			throw new FactRuleError(`A brand can have at most ${MAX_ACTIVE_FACTS} active facts. Retire one first.`);
		}
		if (duplicateOf(statement, active)) throw new FactRuleError("That fact is already recorded.");
		const [row] = await tx
			.insert(brandFacts)
			.values({ brandId, statement, category: input.category?.trim() || null, validFrom: input.validFrom })
			.returning({ id: brandFacts.id });
		return row.id;
	});
}

/** A new record that supersedes the fact from `effectiveFrom`; the old one ends the day before. */
export async function recordFactChange(
	db: DbConnection,
	brandId: string,
	factId: string,
	input: { statement: string; effectiveFrom: string },
	today = utcToday(),
): Promise<string> {
	const statement = checkStatement(input.statement);
	checkNotFuture(input.effectiveFrom, today, "The date a change took effect");
	return forBrand(db, brandId, async (tx) => {
		const old = await lockedFact(tx, brandId, factId);
		if (old.validTo !== null) throw new FactRuleError("Only a fact that is still true can be changed.");
		if (input.effectiveFrom <= old.validFrom) {
			throw new FactRuleError(
				`A change has to take effect after ${old.validFrom}, the day this version became true, so that only one version is true on any day.`,
			);
		}
		if (normalizeStatement(old.statement).toLowerCase() === statement.toLowerCase()) {
			throw new FactRuleError("The new statement is the same as the current one.");
		}
		if (duplicateOf(statement, await activeFacts(tx, brandId), old.id)) {
			throw new FactRuleError("That fact is already recorded.");
		}
		await tx
			.update(brandFacts)
			.set({ validTo: addDays(input.effectiveFrom, -1) })
			.where(eq(brandFacts.id, old.id));
		const [row] = await tx
			.insert(brandFacts)
			.values({ brandId, statement, category: old.category, validFrom: input.effectiveFrom, supersedes: old.id })
			.returning({ id: brandFacts.id });
		return row.id;
	});
}

/** The fact stops being true from `noLongerTrueFrom`, so its last true day is the day before. */
export async function retireFact(
	db: DbConnection,
	brandId: string,
	factId: string,
	noLongerTrueFrom: string,
	today = utcToday(),
): Promise<void> {
	checkNotFuture(noLongerTrueFrom, today, "The date a fact stopped being true");
	await forBrand(db, brandId, async (tx) => {
		const fact = await lockedFact(tx, brandId, factId);
		if (fact.validTo !== null) throw new FactRuleError("That fact has already ended.");
		if (noLongerTrueFrom <= fact.validFrom) {
			throw new FactRuleError(`A fact can only be retired from a day after ${fact.validFrom}, the day it became true.`);
		}
		await tx
			.update(brandFacts)
			.set({ validTo: addDays(noLongerTrueFrom, -1) })
			.where(eq(brandFacts.id, fact.id));
	});
}

/**
 * Deletes a fact that was recorded by mistake: only an original record (not a change) that nothing
 * supersedes and no verdict has used. One statement checks and deletes, and the verdicts' foreign key
 * refuses the delete anyway if a verdict lands first.
 */
export async function deleteFact(db: DbConnection, brandId: string, factId: string): Promise<void> {
	const deleted = await forBrand(db, brandId, (tx) =>
		tx
			.delete(brandFacts)
			.where(
				and(
					eq(brandFacts.id, factId),
					eq(brandFacts.brandId, brandId),
					isNull(brandFacts.supersedes),
					sql`NOT EXISTS (SELECT 1 FROM ${brandFacts} AS next WHERE next.supersedes = ${factId})`,
					sql`NOT EXISTS (SELECT 1 FROM ${perceptionVerdicts} WHERE ${perceptionVerdicts.factId} = ${factId})`,
				),
			)
			.returning({ id: brandFacts.id }),
	);
	if (deleted.length === 0) {
		throw new FactRuleError("Only an unchanged fact that hasn't been used to judge any answer can be deleted.");
	}
}
