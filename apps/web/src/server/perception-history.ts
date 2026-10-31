import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { z } from "zod";
import { lookbackSchema } from "@/lib/lookback";
import { getTimezoneLookbackRange } from "@/lib/timezone-utils";
import { getPerceptionHistory } from "@/server/perception-history-core";
import { requirePerceptionSession } from "@/server/perception-session";

export const getPerceptionHistoryFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			brandId: z.string(),
			lookback: lookbackSchema.default("3m"),
			model: z.string().optional(),
			attributeKey: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		await requirePerceptionSession(data.brandId);
		// Perception days are UTC, whatever the viewer's timezone.
		const range = getTimezoneLookbackRange(data.lookback, "UTC");
		return getPerceptionHistory(db, data.brandId, {
			from: range.fromDateStr,
			to: range.toDateStr,
			model: data.model,
			attributeKey: data.attributeKey,
		});
	});
