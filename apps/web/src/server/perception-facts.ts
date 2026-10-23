import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { calendarDateSchema } from "@/lib/lookback";
import {
	addFact,
	deleteFact,
	isPerceptionEnabled,
	listFacts,
	recordFactChange,
	retireFact,
	setPerceptionEnabled,
} from "@/server/perception-facts-core";

export const getPerceptionSettingsFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		const [enabled, facts] = await Promise.all([isPerceptionEnabled(db, data.brandId), listFacts(db, data.brandId)]);
		return { enabled, facts };
	});

export const setPerceptionEnabledFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), enabled: z.boolean() }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		await setPerceptionEnabled(db, data.brandId, data.enabled);
	});

export const addFactFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			statement: z.string(),
			category: z.string().max(60).nullable().optional(),
			validFrom: calendarDateSchema,
		}),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return { id: await addFact(db, data.brandId, data) };
	});

export const recordFactChangeFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			factId: z.string().uuid(),
			statement: z.string(),
			effectiveFrom: calendarDateSchema,
		}),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return { id: await recordFactChange(db, data.brandId, data.factId, data) };
	});

export const retireFactFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), factId: z.string().uuid(), noLongerTrueFrom: calendarDateSchema }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		await retireFact(db, data.brandId, data.factId, data.noLongerTrueFrom);
	});

export const deleteFactFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), factId: z.string().uuid() }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		await deleteFact(db, data.brandId, data.factId);
	});
