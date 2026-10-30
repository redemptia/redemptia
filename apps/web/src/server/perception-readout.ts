import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { DAILY_JEV_CALL_CEILING } from "@workspace/lib/perception/limits";
import { z } from "zod";
import { lookbackSchema } from "@/lib/lookback";
import { getTimezoneLookbackRange } from "@/lib/timezone-utils";
import { getFactReadout, jevCallsToday } from "@/server/perception-readout-core";
import { requirePerceptionSession } from "@/server/perception-session";

export const getFactReadoutFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			brandId: z.string(),
			lookback: lookbackSchema.default("1m"),
			model: z.string().optional(),
			tags: z.array(z.string().max(100)).max(50).optional(),
		}),
	)
	.handler(async ({ data }) => {
		await requirePerceptionSession(data.brandId);
		// Perception days are UTC, whatever the viewer's timezone.
		const range = getTimezoneLookbackRange(data.lookback, "UTC");
		return getFactReadout(db, data.brandId, {
			from: range.fromDateStr,
			to: range.toDateStr,
			model: data.model,
			tags: data.tags,
		});
	});

export const getDailyCheckBudgetFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		await requirePerceptionSession(data.brandId);
		return { used: await jevCallsToday(db, data.brandId), ceiling: DAILY_JEV_CALL_CEILING };
	});
