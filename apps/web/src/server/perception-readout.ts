import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { lookbackSchema } from "@/lib/lookback";
import { getTimezoneLookbackRange } from "@/lib/timezone-utils";
import { getFactReadout } from "@/server/perception-readout-core";

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
		await requireBrandSession(data.brandId);
		// Perception days are UTC, whatever the viewer's timezone.
		const range = getTimezoneLookbackRange(data.lookback, "UTC");
		return getFactReadout(db, data.brandId, {
			from: range.fromDateStr,
			to: range.toDateStr,
			model: data.model,
			tags: data.tags,
		});
	});
