import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { lookbackSchema } from "@/lib/lookback";
import { getTimezoneLookbackRange } from "@/lib/timezone-utils";
import { attributeSources, marketProminence } from "@/server/perception-prominence-core";

/** Market prominence and each attribute's sources over the lookback, in UTC days like the rest of perception. */
export const getMarketReadoutFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string(), lookback: lookbackSchema.default("1m"), model: z.string().optional() }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		const range = getTimezoneLookbackRange(data.lookback, "UTC");
		const to = new Date(`${range.toDateStr}T00:00:00Z`);
		to.setUTCDate(to.getUTCDate() + 1);
		const filters = { from: new Date(`${range.fromDateStr}T00:00:00Z`), to, model: data.model };
		const [prominence, sources] = await Promise.all([
			marketProminence(db, data.brandId, filters),
			attributeSources(db, data.brandId, filters),
		]);
		return { prominence, sources };
	});
