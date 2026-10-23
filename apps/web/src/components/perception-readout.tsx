import { IconAlertTriangle, IconCircleDashed } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { getModelMeta } from "@workspace/config/models";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import type { ContradictionAlert, FactCoverage, FactReadout } from "@/server/perception-readout-core";

/** Below this many answers a figure is absent, not greyed (SPEC §11.4, rule 2). */
const MIN_ANSWERS = 10;

const percent = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;
const day = (iso: string) =>
	new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
		new Date(iso),
	);
const answersLabel = (n: number) => `${n.toLocaleString("en-US")} answer${n === 1 ? "" : "s"}`;

function Grounding({ fact }: { fact: FactCoverage }) {
	const { grounding, answers } = fact;
	return (
		<p className="text-xs text-muted-foreground">
			Of these answers, {percent(grounding.cited, answers)} cite any source, {percent(grounding.citedSite, answers)}{" "}
			cite your site
			{fact.sourceUrl ? `, and ${percent(grounding.citedSource, answers)} cite this fact's source page` : ""}.
		</p>
	);
}

function CoverageRow({ fact }: { fact: FactCoverage }) {
	const enough = fact.answers >= MIN_ANSWERS;
	return (
		<li className="space-y-1 border-b py-3 last:border-b-0">
			<p className="font-medium">"{fact.statement}"</p>
			{enough ? (
				<>
					<p className="text-sm">
						<span className="font-medium">Stated in {percent(fact.stated, fact.answers)}</span>
						<span className="text-muted-foreground">
							{" "}
							· unclear in {percent(fact.unclear, fact.answers)} · not mentioned in {percent(fact.absent, fact.answers)}{" "}
							of {answersLabel(fact.answers)} to fact prompts
						</span>
						{fact.contradicted > 0 && (
							<span className="text-destructive">
								{" "}
								· {fact.contradicted} contradiction{fact.contradicted === 1 ? "" : "s"}, listed below
							</span>
						)}
					</p>
					<Grounding fact={fact} />
				</>
			) : (
				<p className="text-sm text-muted-foreground">
					Not enough data yet: {answersLabel(fact.answers)} so far, and figures show from {MIN_ANSWERS}.
				</p>
			)}
		</li>
	);
}

function groundingNote(alert: ContradictionAlert): string {
	if (!alert.cited) return "cited no sources";
	if (alert.citedSource) return "cited your source page";
	if (alert.citedSite) return "cited your site, but not this fact's source page";
	return "cited other sources, not your site";
}

function Alert({ alert, org, brand }: { alert: ContradictionAlert; org: string; brand: string }) {
	return (
		<li className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
			<p className="flex items-center gap-2 text-sm font-medium text-destructive">
				<IconAlertTriangle className="size-4" aria-hidden />
				Contradicts your fact
			</p>
			<div className="space-y-1 text-sm">
				<p>
					<span className="text-muted-foreground">AI said: </span>
					{alert.passage ? (
						`"${alert.passage}"`
					) : (
						<span className="text-muted-foreground">no single passage; see the answer</span>
					)}
				</p>
				<p>
					<span className="text-muted-foreground">Your fact: </span>"{alert.statement}"
				</p>
			</div>
			<p className="text-xs text-muted-foreground">
				{getModelMeta(alert.model).label} · {day(alert.answeredAt)} · this answer {groundingNote(alert)} ·{" "}
				{alert.sourceUrl && alert.sourceReadAt ? (
					<>
						our source:{" "}
						<a href={alert.sourceUrl} target="_blank" rel="noreferrer" className="underline">
							{new URL(alert.sourceUrl).hostname}
						</a>
						, read {day(alert.sourceReadAt)}
					</>
				) : (
					"no source recorded for this fact"
				)}{" "}
				·{" "}
				<Link
					to="/app/org/$org/brand/$brand/prompts/$promptId"
					params={{ org, brand, promptId: alert.promptId }}
					className="underline"
				>
					answers to "{alert.prompt}"
				</Link>
			</p>
		</li>
	);
}

/**
 * Coverage is the headline; contradictions are individual alerts, never a rate; grounding sits
 * beside both. "Not mentioned" is never shown as wrong: it has its own wording and no alert colour.
 */
export function PerceptionReadout({ readout, org, brand }: { readout: FactReadout; org: string; brand: string }) {
	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle>How often AI states your facts</CardTitle>
					<p className="text-sm text-muted-foreground">
						Each fact is checked against every answer to your fact prompts. Not mentioned isn't wrong: it means the
						answer didn't say it, which is the gap to close.
					</p>
				</CardHeader>
				<CardContent>
					{readout.facts.length === 0 ? (
						<p className="flex items-center gap-2 text-sm text-muted-foreground">
							<IconCircleDashed className="size-4" aria-hidden />
							No answers have been checked against your facts for these filters yet.
						</p>
					) : (
						<ul>
							{readout.facts.map((fact) => (
								<CoverageRow key={fact.factId} fact={fact} />
							))}
						</ul>
					)}
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Answers that contradict your facts</CardTitle>
					<p className="text-sm text-muted-foreground">
						Each one on its own, with what the answer said, where it came from and our source.
						{readout.alertCount > readout.alerts.length &&
							` Showing the latest ${readout.alerts.length} of ${readout.alertCount}.`}
					</p>
				</CardHeader>
				<CardContent>
					{readout.alerts.length === 0 ? (
						<p className="text-sm text-muted-foreground">No answer contradicts your facts for these filters.</p>
					) : (
						<ul className="space-y-3">
							{readout.alerts.map((alert) => (
								<Alert key={alert.verdictId} alert={alert} org={org} brand={brand} />
							))}
						</ul>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
