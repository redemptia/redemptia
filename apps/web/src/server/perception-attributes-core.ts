/**
 * A brand's attributes. All history keys on an attribute's `key`, which is random, never shown and
 * never reused, so renaming is free. A new question is a new series: its version goes up and the old
 * text is kept. Retiring keeps the row and its history. A merge is a question edit on the attribute
 * that stays, with the other one retired beside it. Migration 0038's trigger holds the key and the
 * version rule in the database too, so a writer that skips this file still can't break them.
 *
 * Every function takes the brand id the caller has already authorized, and scopes every read and
 * write to it.
 */
import { randomBytes } from "node:crypto";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { perceptionAttributes, perceptionAttributeVersions } from "@workspace/lib/db/schema-perception";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { forBrand } from "@/server/perception-facts-core";

/** The judge asks one question per active attribute, and 10 keeps an association call at 12. */
export const MAX_ACTIVE_ATTRIBUTES = 10;
const MAX_LABEL_CHARS = 60;
const MAX_TEXT_CHARS = 500;

/** A rule the user broke; its message is shown to them as written. */
export class AttributeRuleError extends Error {}

export interface AttributeRecord {
	id: string;
	key: string;
	label: string;
	questionText: string;
	questionVersion: number;
	marketPromptText: string;
	retiredAt: Date | null;
}

export interface AttributeInput {
	label: string;
	questionText: string;
	marketPromptText: string;
}

function newKey(): string {
	return `attr_${randomBytes(9).toString("base64url")}`;
}

function oneLine(value: string, what: string, max: number): string {
	const text = value.trim().replace(/\s+/g, " ");
	if (!text) throw new AttributeRuleError(`Give the attribute ${what}.`);
	if (text.length > max) throw new AttributeRuleError(`Keep ${what} under ${max} characters.`);
	return text;
}

const checkLabel = (label: string) => oneLine(label, "a name", MAX_LABEL_CHARS);
const checkQuestion = (text: string) => oneLine(text, "a question", MAX_TEXT_CHARS);
const checkMarketPrompt = (text: string) => oneLine(text, "a market prompt", MAX_TEXT_CHARS);

export async function listAttributes(db: DbConnection, brandId: string): Promise<AttributeRecord[]> {
	return db
		.select({
			id: perceptionAttributes.id,
			key: perceptionAttributes.key,
			label: perceptionAttributes.label,
			questionText: perceptionAttributes.questionText,
			questionVersion: perceptionAttributes.questionVersion,
			marketPromptText: perceptionAttributes.marketPromptText,
			retiredAt: perceptionAttributes.retiredAt,
		})
		.from(perceptionAttributes)
		.where(eq(perceptionAttributes.brandId, brandId))
		.orderBy(asc(perceptionAttributes.createdAt), asc(perceptionAttributes.id));
}

async function lockedActive(tx: DbConnection, brandId: string, attributeId: string) {
	const [attribute] = await tx
		.select()
		.from(perceptionAttributes)
		.where(and(eq(perceptionAttributes.id, attributeId), eq(perceptionAttributes.brandId, brandId)))
		.for("update");
	if (!attribute) throw new AttributeRuleError("That attribute doesn't exist.");
	if (attribute.retiredAt) throw new AttributeRuleError("That attribute is retired.");
	return attribute;
}

export async function addAttribute(db: DbConnection, brandId: string, input: AttributeInput): Promise<string> {
	const label = checkLabel(input.label);
	const questionText = checkQuestion(input.questionText);
	const marketPromptText = checkMarketPrompt(input.marketPromptText);
	return forBrand(db, brandId, async (tx) => {
		const [{ active }] = await tx
			.select({ active: sql<number>`count(*)::int` })
			.from(perceptionAttributes)
			.where(and(eq(perceptionAttributes.brandId, brandId), isNull(perceptionAttributes.retiredAt)));
		if (active >= MAX_ACTIVE_ATTRIBUTES) {
			throw new AttributeRuleError(
				`A brand can have at most ${MAX_ACTIVE_ATTRIBUTES} active attributes. Retire or merge one first.`,
			);
		}
		const [row] = await tx
			.insert(perceptionAttributes)
			.values({ brandId, key: newKey(), label, questionText, marketPromptText })
			.returning({ id: perceptionAttributes.id });
		await tx.insert(perceptionAttributeVersions).values({ attributeId: row.id, questionVersion: 1, questionText });
		return row.id;
	});
}

/** Changes only the name shown. The judge never sees it, so no history moves. */
export async function renameAttribute(
	db: DbConnection,
	brandId: string,
	attributeId: string,
	label: string,
): Promise<void> {
	const checked = checkLabel(label);
	await forBrand(db, brandId, async (tx) => {
		await lockedActive(tx, brandId, attributeId);
		await tx
			.update(perceptionAttributes)
			.set({ label: checked, updatedAt: sql`now()` })
			.where(eq(perceptionAttributes.id, attributeId));
	});
}

/** Starts a new series under the next version, unless the text is unchanged. Returns the current version. */
async function setQuestion(
	tx: DbConnection,
	attribute: typeof perceptionAttributes.$inferSelect,
	questionText: string,
): Promise<number> {
	if (attribute.questionText === questionText) return attribute.questionVersion;
	const questionVersion = attribute.questionVersion + 1;
	await tx
		.update(perceptionAttributes)
		.set({ questionText, questionVersion, updatedAt: sql`now()` })
		.where(eq(perceptionAttributes.id, attribute.id));
	await tx.insert(perceptionAttributeVersions).values({ attributeId: attribute.id, questionVersion, questionText });
	return questionVersion;
}

export async function editAttributeQuestion(
	db: DbConnection,
	brandId: string,
	attributeId: string,
	questionText: string,
): Promise<number> {
	const checked = checkQuestion(questionText);
	return forBrand(db, brandId, async (tx) => setQuestion(tx, await lockedActive(tx, brandId, attributeId), checked));
}

/** Takes the attribute off the judge's list. Its row and every verdict stay, so history views keep it. */
export async function retireAttribute(db: DbConnection, brandId: string, attributeId: string): Promise<void> {
	await forBrand(db, brandId, async (tx) => {
		await lockedActive(tx, brandId, attributeId);
		await tx
			.update(perceptionAttributes)
			.set({ retiredAt: sql`now()`, updatedAt: sql`now()` })
			.where(eq(perceptionAttributes.id, attributeId));
	});
}

/**
 * Folds `retireId` into `keepId`: the kept attribute takes the merged question (a new series, so its
 * chart segments there) and market prompt, and the other is retired with its history intact.
 */
export async function mergeAttributes(
	db: DbConnection,
	brandId: string,
	input: { keepId: string; retireId: string; questionText: string; marketPromptText: string },
): Promise<void> {
	if (input.keepId === input.retireId) throw new AttributeRuleError("Pick two different attributes to merge.");
	const questionText = checkQuestion(input.questionText);
	const marketPromptText = checkMarketPrompt(input.marketPromptText);
	await forBrand(db, brandId, async (tx) => {
		const keep = await lockedActive(tx, brandId, input.keepId);
		await lockedActive(tx, brandId, input.retireId);
		await setQuestion(tx, keep, questionText);
		await tx
			.update(perceptionAttributes)
			.set({ marketPromptText, updatedAt: sql`now()` })
			.where(eq(perceptionAttributes.id, keep.id));
		await tx
			.update(perceptionAttributes)
			.set({ retiredAt: sql`now()`, updatedAt: sql`now()` })
			.where(eq(perceptionAttributes.id, input.retireId));
	});
}
