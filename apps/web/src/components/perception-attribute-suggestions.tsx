import { clauseNotes, failureStateProblem, mergeAttributes } from "@workspace/lib/perception/attribute-question";
import type { AttributeProposalResult, ProposedAttribute } from "@workspace/lib/perception/propose-attributes";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import { useEffect, useState } from "react";

export type AttributeSuggestionsState =
	| { status: "none" }
	| { status: "pending" }
	| { status: "failed"; error: string }
	| {
			status: "done";
			suggestions: Pick<AttributeProposalResult, "grounding" | "sample" | "proposals" | "heldBack">;
	  };

export interface ConfirmInput {
	label: string;
	quality: string;
	marketPromptText: string;
}

export interface ConfirmOutcome {
	associationPrompts: number;
	promptError: string | null;
}

/** One row the user is working on: a proposal as they've edited it, or two merged into one. */
interface Draft {
	id: string;
	label: string;
	quality: string;
	/** What the question was built from: one quality, or the qualities merges joined. */
	qualities: string[];
	marketPromptText: string;
	quotes: string[];
	kept: boolean;
	/** Held back behind "Show more" until the user asks for it. */
	held: boolean;
	/** The two drafts this one replaced, so a merge can be undone. */
	mergedFrom: [Draft, Draft] | null;
}

const draftOf = (proposal: ProposedAttribute, i: number, held: boolean): Draft => ({
	id: `p${i}`,
	held,
	label: proposal.label,
	quality: proposal.quality,
	qualities: [proposal.quality],
	marketPromptText: proposal.marketPromptText,
	quotes: proposal.quote ? [proposal.quote] : [],
	kept: false,
	mergedFrom: null,
});

function Grounding({
	suggestions,
}: {
	suggestions: Extract<AttributeSuggestionsState, { status: "done" }>["suggestions"];
}) {
	const { grounding, sample } = suggestions;
	if (grounding === "warm") {
		return (
			<p className="text-sm text-muted-foreground">
				Read from {sample.answers} answers to {sample.prompts} of your prompts, across {sample.models} model
				{sample.models === 1 ? "" : "s"}. Each quote is from one of those answers.
			</p>
		);
	}
	if (grounding === "cold") {
		return (
			<p className="text-sm text-muted-foreground">
				A starting guess from your market: there aren't enough answers about your brand yet (15 across 5 prompts) to
				read its own vocabulary. Answers to your association prompts start being collected once you save attributes, and
				the attributes can be revised as they come in.
			</p>
		);
	}
	return (
		<p className="text-sm text-destructive">
			No research provider answered, so these are generic qualities most markets compare on. Edit them, or try again
			later.
		</p>
	);
}

function DraftRow({
	draft,
	canKeep,
	mergeFrom,
	onChange,
	onMergeStart,
	onMergeInto,
	onUnmerge,
}: {
	draft: Draft;
	canKeep: boolean;
	mergeFrom: Draft | null;
	onChange: (draft: Draft) => void;
	onMergeStart: () => void;
	onMergeInto: () => void;
	onUnmerge: () => void;
}) {
	const warnings = [failureStateProblem(draft.quality), ...clauseNotes(draft.qualities)].filter(
		(warning): warning is string => warning !== null,
	);
	const picking = mergeFrom !== null;
	return (
		<li className={`space-y-2 rounded-lg border p-3 ${mergeFrom?.id === draft.id ? "border-primary" : ""}`}>
			<div className="flex items-start gap-3">
				<Checkbox
					id={`keep-${draft.id}`}
					checked={draft.kept}
					disabled={!draft.kept && !canKeep}
					onCheckedChange={(checked) => onChange({ ...draft, kept: checked === true })}
					aria-label={`Keep ${draft.label}`}
				/>
				<div className="min-w-0 flex-1 space-y-2">
					<div className="flex flex-wrap items-center gap-2">
						<Textarea
							className="min-h-9 max-w-md font-medium"
							rows={1}
							value={draft.label}
							aria-label="Name"
							onChange={(event) => onChange({ ...draft, label: event.target.value })}
						/>
						{draft.mergedFrom && <Badge variant="secondary">Merged</Badge>}
					</div>
					<div className="space-y-1">
						<Label htmlFor={`quality-${draft.id}`} className="text-xs text-muted-foreground">
							The judge asks: How does this answer characterise your brand's…
						</Label>
						<Textarea
							id={`quality-${draft.id}`}
							className="min-h-9"
							rows={1}
							value={draft.quality}
							onChange={(event) => onChange({ ...draft, quality: event.target.value, qualities: [event.target.value] })}
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor={`market-${draft.id}`} className="text-xs text-muted-foreground">
							Market prompt (saved now, tracked once market prompts arrive)
						</Label>
						<Textarea
							id={`market-${draft.id}`}
							className="min-h-9"
							rows={1}
							value={draft.marketPromptText}
							onChange={(event) => onChange({ ...draft, marketPromptText: event.target.value })}
						/>
					</div>
					{draft.quotes.map((quote) => (
						<p key={quote} className="text-sm italic text-muted-foreground">
							“{quote}”
						</p>
					))}
					{warnings.map((warning) => (
						<p key={warning} className="text-sm text-amber-700 dark:text-amber-400">
							{warning}
						</p>
					))}
					<div className="flex flex-wrap gap-2">
						{!picking && (
							<Button variant="outline" size="sm" onClick={onMergeStart}>
								Merge…
							</Button>
						)}
						{picking && mergeFrom.id !== draft.id && (
							<Button variant="outline" size="sm" onClick={onMergeInto}>
								Merge with “{mergeFrom.label}”
							</Button>
						)}
						{draft.mergedFrom && !picking && (
							<Button variant="ghost" size="sm" onClick={onUnmerge}>
								Undo merge
							</Button>
						)}
					</div>
				</div>
			</div>
		</li>
	);
}

/**
 * Suggested attributes: the qualities AI answers judge the brand on, each with the market prompt
 * that would rank brands on it. The user keeps up to the brand's room, merges ones that overlap,
 * and edits any of them; nothing is saved until they confirm.
 */
export function PerceptionAttributeSuggestions({
	state,
	runsLeft,
	room,
	associationPromptsToAdd,
	headroom,
	onSuggest,
	onConfirm,
}: {
	state: AttributeSuggestionsState;
	runsLeft: number;
	/** How many more active attributes the brand can have. */
	room: number;
	/** Association prompts confirming will start tracking: 0 once the brand has them. */
	associationPromptsToAdd: number;
	headroom: { perception: { used: number; cap: number }; brand: { used: number; cap: number } };
	onSuggest: (category: string | null) => Promise<void>;
	onConfirm: (attributes: ConfirmInput[]) => Promise<ConfirmOutcome>;
}) {
	const [category, setCategory] = useState("");
	const [drafts, setDrafts] = useState<Draft[]>([]);
	const [showMore, setShowMore] = useState(false);
	const [mergeFrom, setMergeFrom] = useState<Draft | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [outcome, setOutcome] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const done = state.status === "done" ? state.suggestions : null;

	useEffect(() => {
		setDrafts(
			done ? [...done.proposals, ...done.heldBack].map((p, i) => draftOf(p, i, i >= done.proposals.length)) : [],
		);
		setShowMore(false);
		setMergeFrom(null);
	}, [done]);

	const visible = showMore ? drafts : drafts.filter((draft) => !draft.held);
	const kept = drafts.filter((draft) => draft.kept);
	const moreCount = drafts.length - visible.length;
	const replace = (id: string, next: Draft[]) =>
		setDrafts((current) => current.flatMap((draft) => (draft.id === id ? next : [draft])));

	const merge = (target: Draft) => {
		if (!mergeFrom) return;
		const merged = mergeAttributes(mergeFrom, target);
		const draft: Draft = {
			id: `m${mergeFrom.id}${target.id}`,
			label: merged.label,
			quality: merged.quality,
			qualities: merged.qualities,
			marketPromptText: merged.marketPromptText,
			quotes: [...mergeFrom.quotes, ...target.quotes],
			kept: mergeFrom.kept || target.kept,
			held: false,
			mergedFrom: [mergeFrom, target],
		};
		setDrafts((current) => current.filter((d) => d.id !== mergeFrom.id).map((d) => (d.id === target.id ? draft : d)));
		setMergeFrom(null);
	};

	return (
		<div className="space-y-4">
			<div>
				<h2 className="text-xl font-semibold">Suggested attributes</h2>
				<p className="text-sm text-muted-foreground">
					The qualities AI answers judge your brand on, read from what they already say about it, never from your own
					website. Keep up to {room}, merge any that overlap, and edit any of them. Nothing is saved until you confirm.
				</p>
			</div>
			<div className="flex flex-wrap items-end gap-3">
				<div className="min-w-64 flex-1 space-y-1">
					<Label htmlFor="attribute-category">What your brand is, in a few words (optional)</Label>
					<Input
						id="attribute-category"
						placeholder="e.g. Postgres backend-as-a-service"
						value={category}
						onChange={(event) => setCategory(event.target.value)}
					/>
				</div>
				<Button
					variant="outline"
					disabled={state.status === "pending" || runsLeft === 0}
					onClick={async () => {
						setError(null);
						setOutcome(null);
						try {
							await onSuggest(category.trim() || null);
						} catch (failure) {
							setError(failure instanceof Error ? failure.message : "Couldn't start.");
						}
					}}
				>
					Suggest attributes (about $0.05)
				</Button>
				<span className="text-sm text-muted-foreground">
					{runsLeft} run{runsLeft === 1 ? "" : "s"} left today
				</span>
			</div>
			{error && <p className="text-sm text-destructive">{error}</p>}
			{state.status === "pending" && (
				<p className="text-sm text-muted-foreground">Working out your attributes. This takes a minute or two.</p>
			)}
			{state.status === "failed" && <p className="text-sm text-destructive">{state.error}</p>}
			{done && (
				<>
					<Grounding suggestions={done} />
					{mergeFrom && (
						<p className="text-sm">
							Pick the suggestion to merge with “{mergeFrom.label}”.{" "}
							<Button variant="link" className="h-auto px-0" onClick={() => setMergeFrom(null)}>
								Cancel
							</Button>
						</p>
					)}
					<ul className="space-y-3">
						{visible.map((draft) => (
							<DraftRow
								key={draft.id}
								draft={draft}
								canKeep={kept.length < room}
								mergeFrom={mergeFrom}
								onChange={(next) => replace(draft.id, [next])}
								onMergeStart={() => setMergeFrom(draft)}
								onMergeInto={() => merge(draft)}
								onUnmerge={() => draft.mergedFrom && replace(draft.id, draft.mergedFrom)}
							/>
						))}
					</ul>
					{moreCount > 0 && (
						<Button variant="link" className="px-0" onClick={() => setShowMore(true)}>
							Show {moreCount} more
						</Button>
					)}
					<div className="space-y-2 rounded-lg border p-4">
						<p className="text-sm">
							Keeping {kept.length} of up to {room}.
							{associationPromptsToAdd > 0 &&
								` Saving also tracks ${associationPromptsToAdd} association prompts ("What is your brand known for?" and the like), which run at your brand's cadence on every enabled model and are billed like any prompt.`}
						</p>
						<p className="text-sm text-muted-foreground">
							Perception prompts: {headroom.perception.used} of {headroom.perception.cap}. All prompts:{" "}
							{headroom.brand.used} of {headroom.brand.cap}.
						</p>
						<Button
							disabled={kept.length === 0 || saving}
							onClick={async () => {
								setError(null);
								setSaving(true);
								try {
									const result = await onConfirm(
										kept.map(({ label, quality, marketPromptText }) => ({ label, quality, marketPromptText })),
									);
									setOutcome(
										result.promptError
											? `Saved ${kept.length} attributes. The association prompts weren't tracked: ${result.promptError}`
											: `Saved ${kept.length} attributes${result.associationPrompts ? ` and started tracking ${result.associationPrompts} association prompts` : ""}.`,
									);
									setDrafts((current) => current.filter((draft) => !draft.kept));
								} catch (failure) {
									setError(failure instanceof Error ? failure.message : "Couldn't save the attributes.");
								} finally {
									setSaving(false);
								}
							}}
						>
							Save {kept.length} attribute{kept.length === 1 ? "" : "s"}
						</Button>
						{outcome && <p className="text-sm">{outcome}</p>}
					</div>
				</>
			)}
		</div>
	);
}
