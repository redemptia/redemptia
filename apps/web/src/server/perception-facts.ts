import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { calendarDateSchema } from "@/lib/lookback";
import {
	enqueueFactSuggestions,
	type FactSuggestionsStatus,
	getFactSuggestions,
	suggestionRunsLeft as suggestionRunsLeftFor,
} from "@/lib/propose-facts-job";
import { getPerceptionCostEstimate } from "@/server/perception-cost";
import {
	addFact,
	deleteFact,
	FactRuleError,
	isPerceptionEnabled,
	listFacts,
	recordFactChange,
	retireFact,
	setPerceptionEnabled,
} from "@/server/perception-facts-core";
import {
	acceptFactSuggestion,
	addFactPrompt,
	listFactPrompts,
	promptHeadroom,
	stopTrackingFactPrompt,
} from "@/server/perception-prompts-core";
import { requirePerceptionSession } from "@/server/perception-session";
import type { PromptBrand } from "@/server/prompts-core";

const sourceSchema = z
	.object({ url: z.string().max(2000), readAt: z.string().max(40), quote: z.string().max(1000).nullable().optional() })
	.nullable()
	.optional();

export const getPerceptionSettingsFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		await requirePerceptionSession(data.brandId);
		const [enabled, facts] = await Promise.all([isPerceptionEnabled(db, data.brandId), listFacts(db, data.brandId)]);
		return { enabled, facts };
	});

export const setPerceptionEnabledFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), enabled: z.boolean() }))
	.handler(async ({ data }) => {
		await requirePerceptionSession(data.brandId);
		await setPerceptionEnabled(db, data.brandId, data.enabled);
	});

export const addFactFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			statement: z.string(),
			category: z.string().max(60).nullable().optional(),
			validFrom: calendarDateSchema,
			source: sourceSchema,
		}),
	)
	.handler(async ({ data }) => {
		await requirePerceptionSession(data.brandId);
		return { id: await addFact(db, data.brandId, data) };
	});

export const recordFactChangeFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			factId: z.string().uuid(),
			statement: z.string(),
			effectiveFrom: calendarDateSchema,
			source: sourceSchema,
		}),
	)
	.handler(async ({ data }) => {
		await requirePerceptionSession(data.brandId);
		return { id: await recordFactChange(db, data.brandId, data.factId, data) };
	});

export const retireFactFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), factId: z.string().uuid(), noLongerTrueFrom: calendarDateSchema }))
	.handler(async ({ data }) => {
		await requirePerceptionSession(data.brandId);
		await retireFact(db, data.brandId, data.factId, data.noLongerTrueFrom);
	});

export const deleteFactFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), factId: z.string().uuid() }))
	.handler(async ({ data }) => {
		await requirePerceptionSession(data.brandId);
		await deleteFact(db, data.brandId, data.factId);
	});

async function promptBrand(brandId: string): Promise<PromptBrand> {
	const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
	if (!brand) throw new FactRuleError("Brand not found.");
	return { id: brand.id, name: brand.name, website: brand.website, organizationId: brand.organizationId };
}

export const getFactPromptsFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		await requirePerceptionSession(data.brandId);
		const [factPrompts, headroom, suggestionRunsLeft] = await Promise.all([
			listFactPrompts(db, data.brandId),
			promptHeadroom(db, data.brandId),
			suggestionRunsLeftFor(data.brandId),
		]);
		return { factPrompts, headroom, suggestionRunsLeft };
	});

export const suggestFactsFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		await requirePerceptionSession(data.brandId);
		await enqueueFactSuggestions(data.brandId);
	});

export const getFactSuggestionsFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }): Promise<FactSuggestionsStatus> => {
		await requirePerceptionSession(data.brandId);
		return getFactSuggestions(data.brandId);
	});

export const acceptFactSuggestionFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			statement: z.string(),
			category: z.string().max(60).nullable().optional(),
			validFrom: calendarDateSchema,
			source: sourceSchema,
			question: z.string().max(500).nullable(),
		}),
	)
	.handler(async ({ data }) => {
		await requirePerceptionSession(data.brandId);
		return acceptFactSuggestion(await promptBrand(data.brandId), data);
	});

export const addFactPromptFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), question: z.string().max(500) }))
	.handler(async ({ data }) => {
		await requirePerceptionSession(data.brandId);
		return { id: await addFactPrompt(await promptBrand(data.brandId), data.question) };
	});

export const stopTrackingFactPromptFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), promptId: z.string().uuid() }))
	.handler(async ({ data }) => {
		await requirePerceptionSession(data.brandId);
		await stopTrackingFactPrompt(await promptBrand(data.brandId), data.promptId);
	});

export const getPerceptionCostFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		await requirePerceptionSession(data.brandId);
		return getPerceptionCostEstimate(db, data.brandId);
	});
