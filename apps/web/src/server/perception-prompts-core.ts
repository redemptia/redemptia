/**
 * Fact and association prompts: ordinary rows in elmo's `prompts` table, marked as perception prompts by a row in
 * ours, so elmo schedules, scrapes and retries them like any other prompt. Created the way elmo's
 * own `createPrompts` creates a prompt (under the org's quota lock, with its quota check), plus
 * elmo's 100-prompt cap, which that path leaves to its callers, and our own perception cap.
 *
 * Every function takes the brand the caller has already authorized, and scopes to it.
 */

import { dedupeKey } from "@workspace/lib/bulk-prompts";
import { MAX_PROMPTS } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { brands, competitors, prompts } from "@workspace/lib/db/schema";
import { perceptionPrompts } from "@workspace/lib/db/schema-perception";
import {
	assertAllowed,
	assertPromptSaveAllowed,
	decidePromptCap,
	WriteDeniedError,
	withQuotaLock,
} from "@workspace/lib/entitlements";
import { attributeQuestion, failureStateProblem } from "@workspace/lib/perception/attribute-question";
import { marketPromptProblem } from "@workspace/lib/perception/propose-attributes";
import { factPromptProblem } from "@workspace/lib/perception/propose-facts";
import { computeSystemTags } from "@workspace/lib/tag-utils";
import { and, asc, count, eq } from "drizzle-orm";
import { createPromptJobScheduler } from "@/lib/job-scheduler";
import { AttributeRuleError, addAttributes } from "@/server/perception-attributes-core";
import { addFact, FactRuleError, type FactSourceInput } from "@/server/perception-facts-core";
import { type PromptBrand, updatePrompt } from "@/server/prompts-core";

/**
 * Enabled perception prompts per brand, across every class: the per-brand cap from Checkpoint 1.
 * Each runs at the brand's cadence on every enabled model, so this is what bounds provider spend.
 */
export const PERCEPTION_PROMPT_CAP = 24;
/** Fact prompts a brand starts with: well inside both caps, leaving room for the other classes. */
export const FACT_PROMPT_START = 10;

/**
 * What a brand's association prompts ask, `{brand}` standing for its name. Each asks for a
 * characterisation, so answers use attribute language; together they are the 6 the spec's 6–10
 * allows, leaving room under the perception cap for fact and market prompts.
 */
export const ASSOCIATION_PROMPT_TEMPLATES = [
	"What is {brand} known for?",
	"What are {brand}'s main strengths and weaknesses?",
	"How would you describe {brand} to someone deciding whether to use it?",
	"What do people praise and criticise about {brand}?",
	"How does {brand} compare with the alternatives in its market?",
	"What reputation does {brand} have among the people who use it?",
] as const;

export interface FactPrompt {
	id: string;
	value: string;
	enabled: boolean;
}

export interface PromptHeadroom {
	/** Enabled perception prompts, against our cap. */
	perception: { used: number; cap: number };
	/** Every prompt the brand has, enabled or not, against elmo's per-brand limit. */
	brand: { used: number; cap: number };
	factPrompts: number;
	factPromptStart: number;
}

export async function listFactPrompts(conn: DbConnection, brandId: string): Promise<FactPrompt[]> {
	return conn
		.select({ id: prompts.id, value: prompts.value, enabled: prompts.enabled })
		.from(prompts)
		.innerJoin(perceptionPrompts, eq(perceptionPrompts.promptId, prompts.id))
		.where(and(eq(prompts.brandId, brandId), eq(perceptionPrompts.class, "fact")))
		.orderBy(asc(prompts.createdAt));
}

export async function promptHeadroom(conn: DbConnection, brandId: string): Promise<PromptHeadroom> {
	const [[perception], [brand], [facts]] = await Promise.all([
		conn
			.select({ n: count() })
			.from(prompts)
			.innerJoin(perceptionPrompts, eq(perceptionPrompts.promptId, prompts.id))
			.where(and(eq(prompts.brandId, brandId), eq(prompts.enabled, true))),
		conn.select({ n: count() }).from(prompts).where(eq(prompts.brandId, brandId)),
		conn
			.select({ n: count() })
			.from(prompts)
			.innerJoin(perceptionPrompts, eq(perceptionPrompts.promptId, prompts.id))
			.where(and(eq(prompts.brandId, brandId), eq(prompts.enabled, true), eq(perceptionPrompts.class, "fact"))),
	]);
	return {
		perception: { used: perception?.n ?? 0, cap: PERCEPTION_PROMPT_CAP },
		brand: { used: brand?.n ?? 0, cap: MAX_PROMPTS },
		factPrompts: facts?.n ?? 0,
		factPromptStart: FACT_PROMPT_START,
	};
}

/** Association prompts the brand tracks, enabled or not. */
export async function associationPromptCount(conn: DbConnection, brandId: string): Promise<number> {
	const [row] = await conn
		.select({ n: count() })
		.from(prompts)
		.innerJoin(perceptionPrompts, eq(perceptionPrompts.promptId, prompts.id))
		.where(and(eq(prompts.brandId, brandId), eq(perceptionPrompts.class, "association")));
	return row?.n ?? 0;
}

/** Tracks a buyer-style question as a fact prompt. Returns its prompt id. */
export async function addFactPrompt(brand: PromptBrand, question: string): Promise<string> {
	const value = question.trim().replace(/\s+/g, " ");
	const problem = factPromptProblem(value, brand.name);
	if (problem) throw new FactRuleError(problem);

	const id = await withQuotaLock(brand.organizationId, async (tx) => {
		const existing = await tx.select({ value: prompts.value }).from(prompts).where(eq(prompts.brandId, brand.id));
		if (existing.some((row) => dedupeKey(row.value) === dedupeKey(value))) {
			throw new FactRuleError("This brand already tracks that question.");
		}
		assertAllowed(decidePromptCap(existing.length, 1));
		const { perception } = await promptHeadroom(tx, brand.id);
		if (perception.used >= PERCEPTION_PROMPT_CAP) {
			throw new FactRuleError(
				`A brand can track at most ${PERCEPTION_PROMPT_CAP} perception prompts. Stop tracking one first.`,
			);
		}
		await assertPromptSaveAllowed(brand.organizationId, { prompts: 1, premiumPairings: 0 }, tx);
		const [row] = await tx
			.insert(prompts)
			.values({
				brandId: brand.id,
				value,
				enabled: true,
				tags: [],
				systemTags: computeSystemTags(value, brand.name, brand.website),
				premiumModels: [],
			})
			.returning({ id: prompts.id });
		// Same transaction: the prompt is never visible as an ordinary prompt, even for a moment.
		await tx.insert(perceptionPrompts).values({ promptId: row.id, class: "fact" });
		return row.id;
	});

	// Outside the transaction, as elmo does: a queue hiccup must not roll back the prompt, and the
	// worker's scheduler picks up what failed.
	await createPromptJobScheduler(id);
	return id;
}

/**
 * Stops running a fact prompt without deleting it. Elmo's delete removes a prompt's runs, which
 * would take their verdicts with them; disabling keeps the history and stops the spend.
 */
export async function stopTrackingFactPrompt(brand: PromptBrand, promptId: string): Promise<void> {
	const [row] = await db
		.select({ id: prompts.id })
		.from(prompts)
		.innerJoin(perceptionPrompts, eq(perceptionPrompts.promptId, prompts.id))
		.where(and(eq(prompts.id, promptId), eq(prompts.brandId, brand.id), eq(perceptionPrompts.class, "fact")));
	if (!row) throw new FactRuleError("That question isn't one of this brand's fact prompts.");
	await updatePrompt(brand, promptId, { enabled: false });
}

/**
 * Accepting a suggestion records the fact and, when asked, tracks its question. The fact the user
 * confirmed is kept even if its question can't be tracked (a cap reached, say), and the reason comes
 * back with it rather than undoing the fact.
 */
export async function acceptFactSuggestion(
	brand: PromptBrand,
	input: {
		statement: string;
		category?: string | null;
		validFrom: string;
		source?: FactSourceInput | null;
		question: string | null;
	},
	today?: string,
): Promise<{ factId: string; promptId: string | null; promptError: string | null }> {
	const factId = await addFact(db, brand.id, input, today);
	if (!input.question) return { factId, promptId: null, promptError: null };
	try {
		return { factId, promptId: await addFactPrompt(brand, input.question), promptError: null };
	} catch (error) {
		if (!(error instanceof FactRuleError || error instanceof WriteDeniedError)) throw error;
		return { factId, promptId: null, promptError: error.message };
	}
}

/**
 * Tracks the association prompts the brand doesn't have yet, all or none. One the brand already
 * tracks, as any kind of prompt, is skipped. Returns how many were added.
 */
export async function addAssociationPrompts(brand: PromptBrand): Promise<number> {
	const wanted = ASSOCIATION_PROMPT_TEMPLATES.map((template) => template.replaceAll("{brand}", brand.name));
	const ids = await withQuotaLock(brand.organizationId, async (tx) => {
		const existing = await tx.select({ value: prompts.value }).from(prompts).where(eq(prompts.brandId, brand.id));
		const tracked = new Set(existing.map((row) => dedupeKey(row.value)));
		const values = wanted.filter((value) => !tracked.has(dedupeKey(value)));
		if (values.length === 0) return [];
		assertAllowed(decidePromptCap(existing.length, values.length));
		const { perception } = await promptHeadroom(tx, brand.id);
		if (perception.used + values.length > PERCEPTION_PROMPT_CAP) {
			throw new AttributeRuleError(
				`Tracking the ${values.length} association prompts would pass the ${PERCEPTION_PROMPT_CAP} perception prompts a brand can track (it has ${perception.used}). Stop tracking some first.`,
			);
		}
		await assertPromptSaveAllowed(brand.organizationId, { prompts: values.length, premiumPairings: 0 }, tx);
		const rows = await tx
			.insert(prompts)
			.values(
				values.map((value) => ({
					brandId: brand.id,
					value,
					enabled: true,
					tags: [],
					systemTags: computeSystemTags(value, brand.name, brand.website),
					premiumModels: [],
				})),
			)
			.returning({ id: prompts.id });
		await tx.insert(perceptionPrompts).values(rows.map((row) => ({ promptId: row.id, class: "association" as const })));
		return rows.map((row) => row.id);
	});
	for (const id of ids) await createPromptJobScheduler(id);
	return ids.length;
}

export interface ConfirmedAttribute {
	label: string;
	/** The noun phrase the judge's question asks about. */
	quality: string;
	marketPromptText: string;
}

/**
 * Saves the attributes a user kept from a proposal, all or none, then tracks the association
 * prompts. The question is built from the quality, so every attribute asks in the one shape the
 * judge expects. The attributes stay saved if the prompts can't be tracked (a cap reached, say);
 * the reason comes back with them.
 */
export async function confirmAttributes(
	brand: PromptBrand,
	inputs: ConfirmedAttribute[],
): Promise<{ attributeIds: string[]; associationPrompts: number; promptError: string | null }> {
	const [brandRow] = await db.select({ aliases: brands.aliases }).from(brands).where(eq(brands.id, brand.id));
	const rivals = await db.select({ name: competitors.name }).from(competitors).where(eq(competitors.brandId, brand.id));
	const names = [brand.name, ...(brandRow?.aliases ?? []), ...rivals.map((rival) => rival.name)];
	const checked = inputs.map((input) => {
		const problem = failureStateProblem(input.quality) ?? marketPromptProblem(input.marketPromptText, names);
		if (problem) throw new AttributeRuleError(`${input.label}: ${problem}`);
		return {
			label: input.label,
			questionText: attributeQuestion(input.quality),
			marketPromptText: input.marketPromptText,
		};
	});
	const attributeIds = await addAttributes(db, brand.id, checked);
	try {
		return { attributeIds, associationPrompts: await addAssociationPrompts(brand), promptError: null };
	} catch (error) {
		if (!(error instanceof AttributeRuleError || error instanceof WriteDeniedError)) throw error;
		return { attributeIds, associationPrompts: 0, promptError: error.message };
	}
}
