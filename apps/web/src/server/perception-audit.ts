import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { perceptionStamps } from "@workspace/lib/db/schema-perception";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { lookbackSchema } from "@/lib/lookback";
import { getTimezoneLookbackRange } from "@/lib/timezone-utils";
import { attributeSources, marketProminence } from "@/server/perception-prominence-core";
import { getFactReadout } from "@/server/perception-readout-core";

export const getPerceptionAuditFn = createServerFn({ method: "GET" })
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
		const range = getTimezoneLookbackRange(data.lookback, "UTC");
		const to = new Date(`${range.toDateStr}T00:00:00Z`);
		to.setUTCDate(to.getUTCDate() + 1);
		const filters = { from: new Date(`${range.fromDateStr}T00:00:00Z`), to, model: data.model };

		const [brand] = await db.select({ name: brands.name }).from(brands).where(eq(brands.id, data.brandId));
		const stamps = await db
			.select({
				layer: perceptionStamps.layer,
				version: perceptionStamps.version,
				updatedAt: perceptionStamps.updatedAt,
			})
			.from(perceptionStamps)
			.where(eq(perceptionStamps.brandId, data.brandId));

		const [factReadout, prominence, sources] = await Promise.all([
			getFactReadout(db, data.brandId, {
				from: range.fromDateStr,
				to: range.toDateStr,
				model: data.model,
				tags: data.tags,
			}),
			marketProminence(db, data.brandId, filters),
			attributeSources(db, data.brandId, filters),
		]);

		return {
			generatedAt: new Date().toISOString(),
			brand: brand?.name ?? data.brandId,
			period: { from: range.fromDateStr, to: range.toDateStr },
			model: data.model ?? "all",
			stamps: Object.fromEntries(stamps.map((s) => [s.layer, { version: s.version, updatedAt: s.updatedAt }])),
			competitorSetFingerprint: prominence.competitorSet?.fingerprint ?? null,
			competitors: prominence.competitorSet?.competitors ?? [],
			factReadout,
			prominence,
			sources,
		};
	});
