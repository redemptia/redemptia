/**
 * How AI answers treat the brand and each competitor, read from stored stance
 * judgements. It opens on the prompts whose answers set the brand back, each
 * label shown with the answer's own words, because that list is what someone
 * acts on; the per-brand mix is a second tab.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { BrandPromptLink } from "@/components/brand-prompt-link";
import { ColHead } from "@/components/col-head";
import { ALL_MODELS_VALUE, FilterBar } from "@/components/filter-bar";
import { FilterSection, PageHeader } from "@/components/page-header";
import { useBrandId } from "@/hooks/use-brand-id";
import { useBrandSentiment } from "@/hooks/use-brand-sentiment";
import { useBrand } from "@/hooks/use-brands";
import { useListFilters } from "@/hooks/use-list-filters";
import { usePromptsSummary } from "@/hooks/use-prompts-summary";
import { pageHead } from "@/lib/route-head";
import type { BrandSentiment, RiskPrompt } from "@/server/analytics-core";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/sentiment")({
	staticData: { crumb: "Sentiment" },
	head: pageHead({ description: "See which prompts' answers advise against you, in the answers' own words." }),
	component: SentimentPage,
});

const STANCE_LABELS = {
	recommended: "Recommended",
	mentioned_neutral: "Neutral",
	mentioned_caveated: "With caveats",
	disrecommended: "Advised against",
	comparison_anchor: "Compared unfavourably",
} as const;

const TIPS = {
	judged: "Mentions whose stance the model has judged. Every figure in this row is over these.",
	net: "Recommended minus advised against and compared unfavourably, as a share of judged mentions: +100% is every answer recommending it, −100% every answer setting it back.",
};

const signedPct = (value: number | null) => {
	if (value === null) return "—";
	const rounded = Math.round(value * 100);
	return rounded > 0 ? `+${rounded}%` : rounded < 0 ? `−${Math.abs(rounded)}%` : "0%";
};

function Notice({ testId, children }: { testId: string; children: React.ReactNode }) {
	return (
		<Card>
			<CardContent className="pt-6">
				<div data-testid={testId} className="text-muted-foreground text-center py-8">
					{children}
				</div>
			</CardContent>
		</Card>
	);
}

function Coverage({ data }: { data: BrandSentiment }) {
	const { mentions, judged, blank } = data.coverage;
	return (
		<Alert data-testid="sentiment-coverage" role="status">
			<AlertTitle>
				{judged.toLocaleString()} of {mentions.toLocaleString()} mentions in this window are judged
			</AlertTitle>
			<AlertDescription>
				{judged === mentions
					? "Every mention in this window is counted below."
					: "Only judged mentions are counted below. The rest are not judged yet, which is not the same as neutral, and they are left out rather than counted."}
				{blank > 0 &&
					` ${blank.toLocaleString()} ${blank === 1 ? "run" : "runs"} had no answer text, so there was nothing to judge; they are left out of every figure.`}
			</AlertDescription>
		</Alert>
	);
}

function RiskList({ data, brandName }: { data: BrandSentiment; brandName: string }) {
	if (data.coverage.judged === 0) {
		return (
			<Notice testId="sentiment-none-judged">
				No mention in this window is judged yet, so there is nothing to list. That doesn't mean answers are neutral.
			</Notice>
		);
	}
	if (data.riskPrompts.length === 0) {
		return (
			<Notice testId="sentiment-no-risk">
				No prompt's answers advise against {brandName} or compare it unfavourably in this window.
			</Notice>
		);
	}
	return (
		<div className="space-y-4" data-testid="risk-prompts">
			{data.riskPrompts.map((prompt) => (
				<RiskPromptCard key={prompt.promptId} prompt={prompt} />
			))}
		</div>
	);
}

function RiskPromptCard({ prompt }: { prompt: RiskPrompt }) {
	return (
		<Card data-risk-prompt={prompt.promptId}>
			<CardHeader>
				<CardTitle className="text-base">
					<BrandPromptLink promptId={prompt.promptId} className="hover:underline">
						{prompt.value}
					</BrandPromptLink>
				</CardTitle>
				<p className="text-sm text-muted-foreground" data-testid="risk-counts">
					{prompt.disrecommended} advised against, {prompt.comparisonAnchor} compared unfavourably
					{prompt.caveated > 0 && `, ${prompt.caveated} with caveats`} — of {prompt.judged} judged mentions
				</p>
			</CardHeader>
			<CardContent className="space-y-3">
				{prompt.evidence.map((item) => (
					<div key={item.runId} className="space-y-1" data-testid="risk-evidence">
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<Badge variant={item.stance === "disrecommended" ? "destructive" : "secondary"}>
								{STANCE_LABELS[item.stance]}
							</Badge>
							<span>
								{item.model} · {new Date(item.createdAt).toLocaleDateString()}
							</span>
						</div>
						{item.evidence ? (
							<blockquote className="border-l-2 pl-3 text-sm">“{item.evidence}”</blockquote>
						) : (
							<p className="border-l-2 pl-3 text-sm text-muted-foreground italic">
								The model's quote didn't match the answer word for word, so none is shown.
							</p>
						)}
					</div>
				))}
			</CardContent>
		</Card>
	);
}

function StanceTable({ data }: { data: BrandSentiment }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>How answers treat each brand</CardTitle>
			</CardHeader>
			<CardContent>
				<Table data-testid="stance-table">
					<TableHeader>
						<TableRow>
							<TableHead>Brand</TableHead>
							<TableHead className="text-right">
								<ColHead label="Judged" tip={TIPS.judged} right />
							</TableHead>
							{Object.values(STANCE_LABELS).map((label) => (
								<TableHead key={label} className="text-right">
									{label}
								</TableHead>
							))}
							<TableHead className="text-right">
								<ColHead label="Net stance" tip={TIPS.net} right />
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{data.subjects.map((subject) => (
							<TableRow
								key={subject.key}
								data-subject={subject.name}
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
									{subject.judged.toLocaleString()} of {subject.mentions.toLocaleString()}
								</TableCell>
								{(Object.keys(STANCE_LABELS) as (keyof typeof STANCE_LABELS)[]).map((stance) => (
									<TableCell key={stance} className="text-right tabular-nums">
										{subject.stances[stance].toLocaleString()}
									</TableCell>
								))}
								<TableCell className="text-right tabular-nums">{signedPct(subject.netStanceRate)}</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}

function SentimentBody({ data, brandName }: { data: BrandSentiment; brandName: string }) {
	if (!data.analysisEnabled && data.coverage.judged === 0) {
		return (
			<Notice testId="sentiment-analysis-off">
				Model analysis is off for this deployment, so answers aren't judged for how they treat you. Mentions, prominence
				and rank don't need it and are on the Mentions page.
			</Notice>
		);
	}
	if (data.coverage.runs === 0) {
		return (
			<Notice testId="sentiment-no-runs">
				No runs yet for the selected filters. Sentiment appears once your prompts have been run and judged.
			</Notice>
		);
	}
	return (
		<TooltipProvider delay={150}>
			{!data.analysisEnabled && (
				<Alert data-testid="sentiment-analysis-off-banner">
					<AlertTitle>Model analysis is off</AlertTitle>
					<AlertDescription>
						What's below comes from earlier judgements. New answers aren't being judged on this deployment.
					</AlertDescription>
				</Alert>
			)}
			<Coverage data={data} />
			<Tabs defaultValue="risk">
				<TabsList>
					<TabsTrigger value="risk">Risk prompts</TabsTrigger>
					<TabsTrigger value="stance">Stance by brand</TabsTrigger>
				</TabsList>
				<TabsContent value="risk" className="pt-2">
					<RiskList data={data} brandName={brandName} />
				</TabsContent>
				<TabsContent value="stance" className="pt-2">
					<StanceTable data={data} />
				</TabsContent>
			</Tabs>
		</TooltipProvider>
	);
}

function SentimentPage() {
	const brandId = useBrandId();
	const { model, lookback, tags } = useListFilters();
	const { data: brand } = useBrand(brandId);
	const trackedTargets = brand?.trackedTargets ?? [];
	const modelParam = model === ALL_MODELS_VALUE ? undefined : model;
	const { data: promptsSummary } = usePromptsSummary(brandId, { lookback, model: modelParam });
	const { data: view, isLoading, error } = useBrandSentiment(brandId, { lookback, model: modelParam, tags });
	const data = view?.inPlan ? view.sentiment : undefined;

	let content: React.ReactNode;
	if (isLoading && !view) {
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
					<div className="text-destructive text-center py-8">Sentiment couldn't be loaded. Try again shortly.</div>
				</CardContent>
			</Card>
		);
	} else if (view && !view.inPlan) {
		content = (
			<Notice testId="sentiment-not-in-plan">
				Sentiment isn't included in your plan. It's available on Basic and above. Mentions, prominence and rank are on
				every plan.
			</Notice>
		);
	} else if (data) {
		content = <SentimentBody data={data} brandName={brand?.name ?? "you"} />;
	}

	return (
		<PageHeader
			title="Sentiment"
			subtitle="Which prompts' answers advise against you, in the answers' own words."
			infoContent={
				<p>
					A model reads each answer that names you or a competitor and judges how it treats them. Only judged mentions
					are counted, and runs with no answer text are left out.
				</p>
			}
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
