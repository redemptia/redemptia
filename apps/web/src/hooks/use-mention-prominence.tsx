import { useQuery } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import type { LookbackPeriod } from "@/lib/lookback";
import { getMentionProminenceFn } from "@/server/analysis";

export interface MentionProminenceFilters {
	lookback?: LookbackPeriod;
	model?: string;
	tags?: string[];
}

export function useMentionProminence(brandId?: string, filters?: MentionProminenceFilters) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	const query = useQuery({
		queryKey: ["mention-prominence", resolvedBrandId || "", filters] as const,
		queryFn: () =>
			getMentionProminenceFn({
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
		placeholderData: (prev) => prev,
	});
	return { data: query.data, isLoading: query.isLoading };
}
