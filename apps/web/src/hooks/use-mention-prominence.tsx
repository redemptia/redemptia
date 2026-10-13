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
		// While some runs aren't analysed a recompute may be filling them in, so
		// keep coverage current without a reload. Not faster: at a large brand's
		// full window one read is over a second.
		refetchInterval: (q) => {
			const coverage = q.state.data?.coverage;
			return coverage && coverage.analysed < coverage.runs - coverage.blank ? 30_000 : false;
		},
	});
	return { data: query.data, isLoading: query.isLoading, error: query.error };
}
