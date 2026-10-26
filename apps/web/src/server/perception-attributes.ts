import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import {
	type AttributeSuggestionsStatus,
	attributeSuggestionRunsLeft,
	enqueueAttributeSuggestions,
	getAttributeSuggestions,
} from "@/lib/propose-attributes-job";
import {
	AttributeRuleError,
	checkMarketPromptWording,
	checkQualityWording,
	checkWording,
	editAttributeQuestion,
	listAttributes,
	MAX_ACTIVE_ATTRIBUTES,
	mergeAttributes,
	renameAttribute,
	retireAttribute,
	setMarketPromptText,
} from "@/server/perception-attributes-core";
import { confirmAttributes, promptHeadroom, syncMarketPrompts } from "@/server/perception-prompts-core";
import type { PromptBrand } from "@/server/prompts-core";

async function promptBrand(brandId: string): Promise<PromptBrand> {
	const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
	if (!brand) throw new AttributeRuleError("Brand not found.");
	return { id: brand.id, name: brand.name, website: brand.website, organizationId: brand.organizationId };
}

export const getAttributesFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		const [attributes, headroom, suggestionRunsLeft] = await Promise.all([
			listAttributes(db, data.brandId),
			promptHeadroom(db, data.brandId),
			attributeSuggestionRunsLeft(data.brandId),
		]);
		return {
			attributes: attributes.map(({ retiredAt, ...attribute }) => ({ ...attribute, retired: retiredAt !== null })),
			maxActive: MAX_ACTIVE_ATTRIBUTES,
			headroom,
			suggestionRunsLeft,
		};
	});

export const suggestAttributesFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), category: z.string().max(500).nullable() }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		await enqueueAttributeSuggestions(data.brandId, data.category);
	});

export const getAttributeSuggestionsFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }): Promise<AttributeSuggestionsStatus> => {
		await requireBrandSession(data.brandId);
		return getAttributeSuggestions(data.brandId);
	});

export const confirmAttributesFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			attributes: z
				.array(
					z.object({ label: z.string().max(200), quality: z.string().max(500), marketPromptText: z.string().max(500) }),
				)
				.min(1)
				.max(MAX_ACTIVE_ATTRIBUTES),
		}),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return confirmAttributes(await promptBrand(data.brandId), data.attributes);
	});

const attributeId = z.string().uuid();
const wording = { quality: z.string().max(500), marketPromptText: z.string().max(500) };

/** One attribute the user writes: saved like a confirmed suggestion, association prompts included. */
export const addAttributeFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), label: z.string().max(200), ...wording }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		const { brandId, ...input } = data;
		return confirmAttributes(await promptBrand(brandId), [input]);
	});

export const renameAttributeFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), attributeId, label: z.string().max(200) }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		await renameAttribute(db, data.brandId, data.attributeId, data.label);
	});

export const editAttributeQuestionFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), attributeId, quality: z.string().max(500) }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		const questionText = checkQualityWording(data.quality);
		return { questionVersion: await editAttributeQuestion(db, data.brandId, data.attributeId, questionText) };
	});

export const setMarketPromptTextFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), attributeId, marketPromptText: z.string().max(500) }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		const text = await checkMarketPromptWording(db, data.brandId, data.marketPromptText);
		await setMarketPromptText(db, data.brandId, data.attributeId, text);
		await syncMarketPrompts(await promptBrand(data.brandId));
	});

export const retireAttributeFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), attributeId }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		await retireAttribute(db, data.brandId, data.attributeId);
		await syncMarketPrompts(await promptBrand(data.brandId));
	});

export const mergeAttributesFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), keepId: attributeId, retireId: attributeId, ...wording }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		const checked = await checkWording(db, data.brandId, data);
		await mergeAttributes(db, data.brandId, { keepId: data.keepId, retireId: data.retireId, ...checked });
		await syncMarketPrompts(await promptBrand(data.brandId));
	});
