import { useQuery } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import type { LookbackPeriod } from "@/lib/lookback";
import { getBrandSentimentFn } from "@/server/analysis";

export interface BrandSentimentFilters {
	lookback?: LookbackPeriod;
	model?: string;
	tags?: string[];
}

export function useBrandSentiment(brandId?: string, filters?: BrandSentimentFilters) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	const query = useQuery({
		queryKey: ["brand-sentiment", resolvedBrandId || "", filters] as const,
		queryFn: () =>
			getBrandSentimentFn({
				data: {
					brandId: resolvedBrandId!,
					lookback: filters?.lookback ?? "1m",
					model: filters?.model,
					tags: filters?.tags?.join(","),
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				},
			}),
		enabled: !!resolvedBrandId,
		staleTime: 30_000,
	});
	return { data: query.data, isLoading: query.isLoading, error: query.error };
}
