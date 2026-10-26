import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { ALL_MODELS_VALUE, FilterBar } from "@/components/filter-bar";
import { FilterSection, PageHeader } from "@/components/page-header";
import { PerceptionMarket } from "@/components/perception-market";
import { PerceptionReadout } from "@/components/perception-readout";
import { useBrandId } from "@/hooks/use-brand-id";
import { useBrand } from "@/hooks/use-brands";
import { useListFilters } from "@/hooks/use-list-filters";
import { usePromptsSummary } from "@/hooks/use-prompts-summary";
import { useBrandParams } from "@/hooks/use-route-params";
import { pageHead } from "@/lib/route-head";
import { getMarketReadoutFn } from "@/server/perception-market";
import { getFactReadoutFn } from "@/server/perception-readout";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/perception")({
	staticData: { crumb: "Perception" },
	head: pageHead({ description: "See whether AI answers state your facts, and where they contradict them." }),
	component: PerceptionPage,
});

function PerceptionPage() {
	const brandId = useBrandId();
	const { org, brand: brandParam } = useBrandParams();
	const { model, lookback, tags } = useListFilters();
	const { data: brand } = useBrand(brandId);
	const modelParam = model === ALL_MODELS_VALUE ? undefined : model;
	const { data: promptsSummary } = usePromptsSummary(brandId, { lookback, model: modelParam, includePerception: true });
	const { data, isLoading, error } = useQuery({
		queryKey: ["perception-readout", brandId, lookback, modelParam, tags],
		queryFn: () => getFactReadoutFn({ data: { brandId, lookback, model: modelParam, tags } }),
	});

	const { data: market } = useQuery({
		queryKey: ["perception-market", brandId, lookback, modelParam],
		queryFn: () => getMarketReadoutFn({ data: { brandId, lookback, model: modelParam } }),
	});

	let content: React.ReactNode;
	if (error && !data) {
		content = (
			<Card>
				<CardContent className="py-8 text-center text-muted-foreground">
					Couldn't load the readout right now. Reload the page to try again.
				</CardContent>
			</Card>
		);
	} else if (isLoading || !data) {
		content = <Skeleton className="h-[320px] w-full" />;
	} else {
		content = <PerceptionReadout readout={data} org={org} brand={brandParam} />;
	}

	return (
		<PageHeader
			title="Perception"
			subtitle="Whether AI answers state your facts, and how AI places you against competitors on each attribute."
			infoContent={
				<div className="space-y-2">
					<p>
						Answers to your fact prompts are checked against each fact that was true on the day of the answer. A fact is
						stated, unclear, not mentioned, or contradicted.
					</p>
					<p>Figures count each answer once per fact, in UTC days, and show only from 10 answers.</p>
					<p>
						Answers to each attribute's market prompt show which tracked brands AI names and how early, against the
						competitor set they were judged with.
					</p>
				</div>
			}
		>
			<FilterSection>
				<FilterBar
					availableTags={promptsSummary?.availableTags ?? []}
					trackedTargets={brand?.trackedTargets ?? []}
					showSearch={false}
					showModelSelector
				/>
			</FilterSection>
			{content}
			{market && <PerceptionMarket prominence={market.prominence} sources={market.sources} />}
		</PageHeader>
	);
}
