/**
 * Where AI answers name the brand and each competitor, read from stored mention
 * analysis. It counts analysed runs only, and says how many runs that is: a run
 * that isn't analysed is shown as such, never as one that didn't mention you.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { ColHead } from "@/components/col-head";
import { ALL_MODELS_VALUE, FilterBar } from "@/components/filter-bar";
import { FilterSection, PageHeader } from "@/components/page-header";
import { useBrandId } from "@/hooks/use-brand-id";
import { useBrand } from "@/hooks/use-brands";
import { useListFilters } from "@/hooks/use-list-filters";
import { useMentionProminence } from "@/hooks/use-mention-prominence";
import { usePromptsSummary } from "@/hooks/use-prompts-summary";
import { pageHead } from "@/lib/route-head";
import type { BrandMentionProminence } from "@/server/analytics-core";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/mentions")({
	staticData: { crumb: "Mentions" },
	head: pageHead({ description: "See how early and in what order AI answers name you and your competitors." }),
	component: MentionsPage,
});

const TIPS = {
	mentioned: "Analysed runs whose answer names this brand.",
	rate: "Share of analysed runs whose answer names this brand.",
	prominence:
		"How early answers name it, over the answers that do: 1.00 when the answer opens with it, lower the later it first appears.",
	rank: "Its average position among the brands an answer names, over the answers that name it: 1.0 means it's named first.",
};

const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);
const fixed = (value: number | null, digits: number) => (value === null ? "—" : value.toFixed(digits));

function Coverage({ coverage }: { coverage: BrandMentionProminence["coverage"] }) {
	const { runs, analysed } = coverage;
	const complete = runs > 0 && analysed === runs;
	return (
		<Alert data-testid="mention-coverage" role="status">
			<AlertTitle>
				{analysed.toLocaleString()} of {runs.toLocaleString()} runs in this window are analysed
			</AlertTitle>
			<AlertDescription>
				{complete
					? "Every run in this window is counted below."
					: "Only analysed runs are counted below. The rest are not analysed yet, which is not the same as not mentioning anyone, and they are left out rather than counted as zero. Coverage drops after you edit your brand or competitors and climbs back as they are re-analysed, so it can rise while you watch; this page checks again every 30 seconds."}
			</AlertDescription>
		</Alert>
	);
}

function MentionsPage() {
	const brandId = useBrandId();
	const { model, lookback, tags } = useListFilters();
	const { data: brand } = useBrand(brandId);
	const trackedTargets = brand?.trackedTargets ?? [];
	const modelParam = model === ALL_MODELS_VALUE ? undefined : model;
	const { data: promptsSummary } = usePromptsSummary(brandId, { lookback, model: modelParam });
	const { data, isLoading, error } = useMentionProminence(brandId, { lookback, model: modelParam, tags });

	const infoContent = (
		<p>
			Counts come from the answer text of analysed runs, so they can differ from Visibility and Share of Voice, which
			count every run.
		</p>
	);

	let content: React.ReactNode;
	if (isLoading && !data) {
		content = (
			<Card>
				<CardHeader>
					<Skeleton className="h-6 w-48" />
				</CardHeader>
				<CardContent className="space-y-4">
					<Skeleton className="h-4 w-3/4" />
					<Skeleton className="h-4 w-2/3" />
				</CardContent>
			</Card>
		);
	} else if (error) {
		content = (
			<Card>
				<CardContent className="pt-6">
					<div className="text-destructive text-center py-8">
						Mention analysis couldn't be loaded. Try again shortly.
					</div>
				</CardContent>
			</Card>
		);
	} else if (!data || data.coverage.runs === 0) {
		content = (
			<Card>
				<CardContent className="pt-6">
					<div className="text-muted-foreground text-center py-8">
						No runs yet for the selected filters. Mentions appear once your prompts have been run and analysed.
					</div>
				</CardContent>
			</Card>
		);
	} else if (data.coverage.analysed === 0) {
		content = (
			<>
				<Coverage coverage={data.coverage} />
				<Card>
					<CardContent className="pt-6">
						<div data-testid="mention-none-analysed" className="text-muted-foreground text-center py-8">
							None of this window's runs are analysed yet, so there is nothing to count. That doesn't mean nobody was
							mentioned.
						</div>
					</CardContent>
				</Card>
			</>
		);
	} else {
		content = (
			<TooltipProvider delay={150}>
				<Coverage coverage={data.coverage} />
				<p className="text-sm text-muted-foreground">
					Counts come from the answer text of analysed runs, so they can differ from Visibility and Share of Voice,
					which count every run.
				</p>
				<Card>
					<CardHeader>
						<CardTitle>Where answers name you</CardTitle>
					</CardHeader>
					<CardContent>
						<Table data-testid="mention-table">
							<TableHeader>
								<TableRow>
									<TableHead>Brand</TableHead>
									<TableHead className="text-right">
										<ColHead label="Mentioned in" tip={TIPS.mentioned} right />
									</TableHead>
									<TableHead className="text-right">
										<ColHead label="Mention rate" tip={TIPS.rate} right />
									</TableHead>
									<TableHead className="text-right">
										<ColHead label="Prominence" tip={TIPS.prominence} right />
									</TableHead>
									<TableHead className="text-right">
										<ColHead label="Avg. rank" tip={TIPS.rank} right />
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.subjects.map((subject) => (
									<TableRow
										key={subject.key}
										data-subject={subject.name}
										data-subject-key={subject.key}
										className={subject.kind === "brand" ? "bg-muted/40" : undefined}
									>
										<TableCell className="font-medium">
											<span className="inline-flex items-center gap-2">
												{subject.name}
												{subject.kind === "brand" && (
													<Badge variant="secondary" className="text-xs">
														You
													</Badge>
												)}
											</span>
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{subject.mentionedRuns.toLocaleString()} of {data.coverage.analysed.toLocaleString()}
										</TableCell>
										<TableCell className="text-right tabular-nums">{pct(subject.mentionRate)}</TableCell>
										<TableCell className="text-right tabular-nums">{fixed(subject.averageProminence, 2)}</TableCell>
										<TableCell className="text-right tabular-nums">{fixed(subject.averageRank, 1)}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			</TooltipProvider>
		);
	}

	return (
		<PageHeader
			title="Mentions"
			subtitle="How early and in what order AI answers name you and your competitors."
			infoContent={infoContent}
		>
			<FilterSection>
				<FilterBar
					availableTags={promptsSummary?.availableTags ?? []}
					trackedTargets={trackedTargets}
					showSearch={false}
					showModelSelector
				/>
			</FilterSection>
			<div className="space-y-6">{content}</div>
		</PageHeader>
	);
}
