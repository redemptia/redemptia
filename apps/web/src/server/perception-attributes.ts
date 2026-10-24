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
import { AttributeRuleError, listAttributes, MAX_ACTIVE_ATTRIBUTES } from "@/server/perception-attributes-core";
import {
	ASSOCIATION_PROMPT_TEMPLATES,
	associationPromptCount,
	confirmAttributes,
	promptHeadroom,
} from "@/server/perception-prompts-core";
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
		const [attributes, headroom, suggestionRunsLeft, associationPrompts] = await Promise.all([
			listAttributes(db, data.brandId),
			promptHeadroom(db, data.brandId),
			attributeSuggestionRunsLeft(data.brandId),
			associationPromptCount(db, data.brandId),
		]);
		return {
			attributes: attributes.map(({ retiredAt, ...attribute }) => ({ ...attribute, retired: retiredAt !== null })),
			maxActive: MAX_ACTIVE_ATTRIBUTES,
			associationPromptsToAdd: Math.max(0, ASSOCIATION_PROMPT_TEMPLATES.length - associationPrompts),
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
