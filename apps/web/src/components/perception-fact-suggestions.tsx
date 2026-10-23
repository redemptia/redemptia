import type { ProposedFact, TargetCoverage } from "@workspace/lib/perception/propose-facts";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";

export type SuggestionsState =
	| { status: "none" }
	| { status: "pending" }
	| { status: "failed"; error: string }
	| {
			status: "done";
			suggestions: {
				proposals: ProposedFact[];
				heldBack: ProposedFact[];
				coverage: TargetCoverage[];
				answered: boolean;
			};
	  };

export interface AcceptInput {
	statement: string;
	category: string | null;
	validFrom: string;
	question: string | null;
}

/** The fact's id, and why its question couldn't be tracked, if it couldn't. */
export type AcceptOutcome = { promptError: string | null };

const TARGET_LABELS: Record<TargetCoverage["target"], string> = {
	pricing: "pricing",
	deployment: "deployment and self-hosting",
	licence: "licence",
	integrations: "integrations",
	security: "security and compliance",
	product: "product details",
};

const readDate = (iso: string) =>
	new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
		new Date(iso),
	);

function Coverage({ coverage }: { coverage: TargetCoverage[] }) {
	const missing = coverage.filter((entry) => !entry.url);
	return (
		<div className="text-sm text-muted-foreground">
			<p>
				Read:{" "}
				{coverage
					.filter((entry) => entry.url)
					.map((entry) => TARGET_LABELS[entry.target])
					.join(", ") || "nothing"}
				.
			</p>
			{missing.length > 0 && (
				<p>
					Couldn't find a page for {missing.map((entry) => TARGET_LABELS[entry.target]).join(", ")}. Add those facts by
					hand.
				</p>
			)}
		</div>
	);
}

function Suggestion({
	proposal,
	today,
	trackByDefault,
	onAccept,
	onDismiss,
}: {
	proposal: ProposedFact;
	today: string;
	trackByDefault: boolean;
	onAccept: (input: AcceptInput) => Promise<AcceptOutcome>;
	onDismiss: () => void;
}) {
	const [statement, setStatement] = useState(proposal.statement);
	const [question, setQuestion] = useState(proposal.prompt);
	const [track, setTrack] = useState(trackByDefault);
	const [state, setState] = useState<{ saving: boolean; error: string | null; done: AcceptOutcome | null }>({
		saving: false,
		error: null,
		done: null,
	});
	const id = `suggestion-${proposal.topic.replace(/\W+/g, "-")}`;

	if (state.done) {
		return (
			<li className="rounded-lg border p-3 text-sm">
				<p>
					Added: <span className="font-medium">{statement}</span>
				</p>
				{state.done.promptError && (
					<p className="text-muted-foreground">Its question isn't tracked: {state.done.promptError}</p>
				)}
			</li>
		);
	}

	return (
		<li className="space-y-3 rounded-lg border p-3">
			<div className="space-y-1">
				<Label htmlFor={`${id}-statement`}>Fact</Label>
				<Input id={`${id}-statement`} value={statement} onChange={(event) => setStatement(event.target.value)} />
				{proposal.notes.length > 0 && (
					<p className="text-sm text-amber-700 dark:text-amber-300">
						This may be more than one claim: {proposal.notes.join(" ")} Edit it down to one, or keep it as it is.
					</p>
				)}
			</div>
			{proposal.related.length > 0 && (
				<div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
					<p className="font-medium">The same page also says:</p>
					<ul className="mt-1 list-disc pl-5">
						{proposal.related.map((related) => (
							<li key={related.statement}>{related.statement}</li>
						))}
					</ul>
					<p className="mt-1">Record the version with every condition, or a correct answer will be marked as wrong.</p>
				</div>
			)}
			<blockquote className="border-l-2 pl-3 text-sm text-muted-foreground">
				"{proposal.quote}"
				<span className="block">
					<a href={proposal.sourceUrl} target="_blank" rel="noreferrer" className="underline">
						{proposal.sourceUrl}
					</a>
					, read {readDate(proposal.readAt)}
				</span>
			</blockquote>
			<div className="space-y-1">
				<div className="flex items-center gap-2">
					<Checkbox id={`${id}-track`} checked={track} onCheckedChange={(value) => setTrack(value === true)} />
					<Label htmlFor={`${id}-track`}>Also ask AI assistants this question</Label>
				</div>
				{track && (
					<Input aria-label="Question" value={question} onChange={(event) => setQuestion(event.target.value)} />
				)}
			</div>
			{proposal.category && <Badge variant="secondary">{proposal.category}</Badge>}
			{state.error && <p className="text-sm text-destructive">{state.error}</p>}
			<div className="flex gap-2">
				<Button
					size="sm"
					disabled={state.saving || !statement.trim()}
					onClick={async () => {
						setState({ saving: true, error: null, done: null });
						try {
							const done = await onAccept({
								statement,
								category: proposal.category || null,
								validFrom: today,
								question: track ? question : null,
							});
							setState({ saving: false, error: null, done });
						} catch (error) {
							setState({
								saving: false,
								error: error instanceof Error ? error.message : "That didn't save.",
								done: null,
							});
						}
					}}
				>
					Accept
				</Button>
				<Button size="sm" variant="ghost" onClick={onDismiss}>
					Dismiss
				</Button>
			</div>
		</li>
	);
}

/**
 * Suggested facts, read from the brand's own site. Nothing here is a fact until the user accepts
 * it, and the source, its read date and a quote sit beside each one so accepting is a check.
 */
export function PerceptionFactSuggestions({
	state,
	runsLeft,
	website,
	today,
	factPromptRoom,
	onSuggest,
	onAccept,
}: {
	state: SuggestionsState;
	runsLeft: number;
	website: string;
	today: string;
	/** How many more questions to tick by default: up to the starting number of fact prompts. */
	factPromptRoom: number;
	onSuggest: () => Promise<void>;
	onAccept: (input: AcceptInput) => Promise<AcceptOutcome>;
}) {
	const [dismissed, setDismissed] = useState<Set<string>>(new Set());
	const [showMore, setShowMore] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const done = state.status === "done" ? state.suggestions : null;
	const visible = (list: ProposedFact[]) => list.filter((proposal) => !dismissed.has(proposal.topic));
	const shown = done ? [...visible(done.proposals), ...(showMore ? visible(done.heldBack) : [])] : [];
	const moreCount = done && !showMore ? visible(done.heldBack).length : 0;

	return (
		<div className="space-y-4">
			<div>
				<h2 className="text-xl font-semibold">Suggested facts</h2>
				<p className="text-sm text-muted-foreground">
					Reads {website}: pricing, deployment, licence, integrations and security pages first, since those are what AI
					answers most often get wrong. Nothing is recorded until you accept it, and you can edit each one first.
				</p>
			</div>
			<div className="flex flex-wrap items-center gap-3">
				<Button
					variant="outline"
					disabled={state.status === "pending" || runsLeft === 0}
					onClick={async () => {
						setError(null);
						try {
							await onSuggest();
						} catch (failure) {
							setError(failure instanceof Error ? failure.message : "Couldn't start.");
						}
					}}
				>
					Suggest facts (about $0.10)
				</Button>
				<span className="text-sm text-muted-foreground">
					{runsLeft} run{runsLeft === 1 ? "" : "s"} left today
				</span>
			</div>
			{error && <p className="text-sm text-destructive">{error}</p>}
			{state.status === "pending" && (
				<p className="text-sm text-muted-foreground">Reading your pages. This takes a minute or two.</p>
			)}
			{state.status === "failed" && <p className="text-sm text-destructive">{state.error}</p>}
			{done && (
				<>
					<Coverage coverage={done.coverage} />
					{!done.answered && (
						<p className="text-sm text-destructive">No research provider answered. Try again later.</p>
					)}
					<ul className="space-y-3">
						{shown.map((proposal, index) => (
							<Suggestion
								key={proposal.topic}
								proposal={proposal}
								today={today}
								trackByDefault={index < factPromptRoom}
								onAccept={onAccept}
								onDismiss={() => setDismissed(new Set([...dismissed, proposal.topic]))}
							/>
						))}
					</ul>
					{moreCount > 0 && (
						<Button variant="link" className="px-0" onClick={() => setShowMore(true)}>
							Show {moreCount} more
						</Button>
					)}
				</>
			)}
		</div>
	);
}
