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
import { prompts } from "@workspace/lib/db/schema";
import { perceptionAttributes, perceptionPrompts } from "@workspace/lib/db/schema-perception";
import {
	assertAllowed,
	assertPromptSaveAllowed,
	decidePromptCap,
	WriteDeniedError,
	withQuotaLock,
} from "@workspace/lib/entitlements";
import { ASSOCIATION_ENABLED } from "@workspace/lib/perception/association";
import { factPromptProblem } from "@workspace/lib/perception/propose-facts";
import { computeSystemTags } from "@workspace/lib/tag-utils";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { createPromptJobScheduler } from "@/lib/job-scheduler";
import { AttributeRuleError, addAttributes, checkWording } from "@/server/perception-attributes-core";
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
 * characterisation, so answers use attribute language; 6 is the low end of the spec's 6–10, leaving
 * room under the perception cap for fact and market prompts.
 *
 * Half are comparison or alternatives prompts because that is where the negatives are: generic
 * prompts about a brand come back almost entirely positive, while "alternatives to" prompts carry
 * most of the criticism.
 *
 * No template names a competitor. Association is judged for the brand alone, and it must not move
 * when the competitor list changes: prominence already re-ranks on every competitor-set change, and
 * the gap between the two is only readable if association holds still.
 *
 * Never edit this list once any brand has confirmed attributes. Prompts have no versions, so an
 * edited template would continue the old one's line across a change in what it asks.
 */
export const ASSOCIATION_PROMPT_TEMPLATES = [
	"What is {brand} known for?",
	"What are {brand}'s main strengths and weaknesses?",
	"How would you describe {brand} to someone deciding whether to use it?",
	"How does {brand} compare with the alternatives in its market?",
	"What are the best alternatives to {brand}, and why would someone switch?",
	"Why do people choose other options over {brand}?",
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

/**
 * Makes the brand's market prompts match its active attributes: one enabled prompt per attribute,
 * asking that attribute's `market_prompt_text` and marked with its key. A new wording is a new prompt
 * (the old one is stopped, keeping its answers), so one prompt never asks two questions over its
 * history. A retired attribute's prompt is stopped. Returns how many were started and stopped.
 */
export async function syncMarketPrompts(brand: PromptBrand): Promise<{ started: number; stopped: number }> {
	const plan = await withQuotaLock(brand.organizationId, async (tx) => {
		const attributes = await tx
			.select({ key: perceptionAttributes.key, text: perceptionAttributes.marketPromptText })
			.from(perceptionAttributes)
			.where(and(eq(perceptionAttributes.brandId, brand.id), isNull(perceptionAttributes.retiredAt)));
		const market = await tx
			.select({ id: prompts.id, value: prompts.value, enabled: prompts.enabled, key: perceptionPrompts.attributeKey })
			.from(prompts)
			.innerJoin(perceptionPrompts, eq(perceptionPrompts.promptId, prompts.id))
			.where(and(eq(prompts.brandId, brand.id), eq(perceptionPrompts.class, "market")));
		const wanted = new Map(attributes.map((a) => [a.key, a.text]));
		const current = (key: string | null, value: string) => key !== null && wanted.get(key) === value;
		const toStop = market.filter((m) => m.enabled && !current(m.key, m.value)).map((m) => m.id);
		const toResume = market.filter((m) => !m.enabled && current(m.key, m.value)).map((m) => m.id);
		const covered = new Set(market.filter((m) => current(m.key, m.value)).map((m) => m.key));
		const toCreate = attributes.filter((a) => !covered.has(a.key));
		if (toCreate.length === 0) return { created: [] as string[], toStop, toResume };

		const existing = await tx.select({ value: prompts.value }).from(prompts).where(eq(prompts.brandId, brand.id));
		const taken = new Set(existing.map((row) => dedupeKey(row.value)));
		const clash = toCreate.find((a) => taken.has(dedupeKey(a.text)));
		if (clash) {
			throw new AttributeRuleError(
				`The brand already tracks "${clash.text}" as another prompt. Reword this attribute's market prompt.`,
			);
		}
		assertAllowed(decidePromptCap(existing.length, toCreate.length));
		const { perception } = await promptHeadroom(tx, brand.id);
		const after = perception.used - toStop.length + toResume.length + toCreate.length;
		if (after > PERCEPTION_PROMPT_CAP) {
			throw new AttributeRuleError(
				`Tracking a market prompt for each attribute would pass the ${PERCEPTION_PROMPT_CAP} perception prompts a brand can track. Stop tracking some fact prompts first.`,
			);
		}
		await assertPromptSaveAllowed(brand.organizationId, { prompts: toCreate.length, premiumPairings: 0 }, tx);
		const rows = await tx
			.insert(prompts)
			.values(
				toCreate.map((a) => ({
					brandId: brand.id,
					value: a.text,
					enabled: true,
					tags: [],
					systemTags: computeSystemTags(a.text, brand.name, brand.website),
					premiumModels: [],
				})),
			)
			.returning({ id: prompts.id, value: prompts.value });
		await tx
			.insert(perceptionPrompts)
			.values(rows.map((row, i) => ({ promptId: row.id, class: "market" as const, attributeKey: toCreate[i].key })));
		return { created: rows.map((row) => row.id), toStop, toResume };
	});
	// Outside the lock, as elmo does: stopping and resuming go through elmo's own prompt update, which
	// takes the lock itself and manages each prompt's schedule.
	for (const id of plan.toStop) await updatePrompt(brand, id, { enabled: false });
	for (const id of plan.toResume) await updatePrompt(brand, id, { enabled: true });
	for (const id of plan.created) await createPromptJobScheduler(id);
	return { started: plan.created.length + plan.toResume.length, stopped: plan.toStop.length };
}

export interface ConfirmedAttribute {
	label: string;
	/** The noun phrase the judge's question asks about. */
	quality: string;
	marketPromptText: string;
}

/**
 * Saves the attributes a user kept from a proposal, all or none, then tracks a market prompt for
 * each (and the association prompts, while association is on). The question is built from the
 * quality, so every attribute asks in the one shape the judge expects. The attributes stay saved if
 * the prompts can't be tracked (a cap reached, say); the reason comes back with them.
 */
export async function confirmAttributes(
	brand: PromptBrand,
	inputs: ConfirmedAttribute[],
): Promise<{ attributeIds: string[]; marketPrompts: number; associationPrompts: number; promptError: string | null }> {
	const checked = [];
	for (const input of inputs) {
		checked.push({ label: input.label, ...(await checkWording(db, brand.id, input)) });
	}
	const attributeIds = await addAttributes(db, brand.id, checked);
	try {
		const associationPrompts = ASSOCIATION_ENABLED ? await addAssociationPrompts(brand) : 0;
		const { started } = await syncMarketPrompts(brand);
		return { attributeIds, marketPrompts: started, associationPrompts, promptError: null };
	} catch (error) {
		if (!(error instanceof AttributeRuleError || error instanceof WriteDeniedError)) throw error;
		return { attributeIds, marketPrompts: 0, associationPrompts: 0, promptError: error.message };
	}
}
