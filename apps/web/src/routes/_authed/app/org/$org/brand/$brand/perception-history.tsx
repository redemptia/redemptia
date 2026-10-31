import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { useState } from "react";
import { ALL_MODELS_VALUE, FilterBar } from "@/components/filter-bar";
import { FilterSection, PageHeader } from "@/components/page-header";
import { PerceptionHistoryView } from "@/components/perception-history";
import { useBrandId } from "@/hooks/use-brand-id";
import { useBrand } from "@/hooks/use-brands";
import { useListFilters } from "@/hooks/use-list-filters";
import { pageHead } from "@/lib/route-head";
import { getPerceptionHistoryFn } from "@/server/perception-history";

const ALL_ATTRIBUTES = "all";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/perception-history")({
	staticData: { crumb: "Perception History" },
	head: pageHead({ description: "See how AI answers about your facts and your market position change over time." }),
	component: PerceptionHistoryPage,
});

function PerceptionHistoryPage() {
	const brandId = useBrandId();
	const { model, lookback } = useListFilters();
	const { data: brand } = useBrand(brandId);
	const modelParam = model === ALL_MODELS_VALUE ? undefined : model;
	const [attribute, setAttribute] = useState(ALL_ATTRIBUTES);
	const attributeKey = attribute === ALL_ATTRIBUTES ? undefined : attribute;
	const { data, isLoading, error } = useQuery({
		queryKey: ["perception-history", brandId, lookback, modelParam, attributeKey],
		queryFn: () => getPerceptionHistoryFn({ data: { brandId, lookback, model: modelParam, attributeKey } }),
	});

	let content: React.ReactNode;
	if (error && !data) {
		content = (
			<Card>
				<CardContent className="py-8 text-center text-muted-foreground">
					Couldn't load the history right now. Reload the page to try again.
				</CardContent>
			</Card>
		);
	} else if (isLoading || !data) {
		content = <Skeleton className="h-[320px] w-full" />;
	} else {
		content = (
			<PerceptionHistoryView
				history={data}
				attributeControl={
					data.attributes.length > 0 && (
						<Select value={attribute} onValueChange={(value) => setAttribute(value ?? ALL_ATTRIBUTES)}>
							<SelectTrigger className="w-[220px]" aria-label="Attribute">
								<SelectValue>{data.attributes.find((a) => a.key === attribute)?.label ?? "All Attributes"}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ALL_ATTRIBUTES}>All Attributes</SelectItem>
								{data.attributes.map((a) => (
									<SelectItem key={a.key} value={a.key}>
										{a.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)
				}
			/>
		);
	}

	return (
		<PageHeader
			title="Perception History"
			subtitle="How AI answers about your facts, and where AI places you in your market, have changed over time."
			infoContent={
				<div className="space-y-2">
					<p>
						Each line starts on the first day there is data and leaves a gap for any day with too few answers. Nothing
						is drawn before history begins.
					</p>
					<p>
						A day uses one version of the judge, or one competitor set, so a figure is never a sum across versions. Days
						are UTC.
					</p>
				</div>
			}
		>
			<FilterSection>
				<FilterBar
					availableTags={[]}
					trackedTargets={brand?.trackedTargets ?? []}
					showSearch={false}
					showModelSelector
				/>
			</FilterSection>
			{content}
		</PageHeader>
	);
}
