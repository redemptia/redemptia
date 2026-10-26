import { clauseNotes, failureStateProblem, qualityOf } from "@workspace/lib/perception/attribute-question";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import { useState } from "react";

export interface AttributeRow {
	id: string;
	label: string;
	questionText: string;
	questionVersion: number;
	marketPromptText: string;
	retired: boolean;
}

export interface AttributeActions {
	add: (input: { label: string; quality: string; marketPromptText: string }) => Promise<void>;
	rename: (attributeId: string, label: string) => Promise<void>;
	editQuestion: (attributeId: string, quality: string) => Promise<void>;
	setMarketPrompt: (attributeId: string, marketPromptText: string) => Promise<void>;
	retire: (attributeId: string) => Promise<void>;
	merge: (input: { keepId: string; retireId: string; quality: string; marketPromptText: string }) => Promise<void>;
}

export interface PromptHeadroomCounts {
	perception: { used: number; cap: number };
	brand: { used: number; cap: number };
}

const asked = (questionText: string) => questionText.replace("{subject}", "your brand");

function Warnings({ quality, qualities }: { quality: string; qualities: string[] }) {
	const warnings = [failureStateProblem(quality), ...clauseNotes(qualities)].filter(
		(warning): warning is string => warning !== null,
	);
	return (
		<>
			{warnings.map((warning) => (
				<p key={warning} className="text-sm text-amber-700 dark:text-amber-400">
					{warning}
				</p>
			))}
		</>
	);
}

/** Runs a write and shows its error next to the form that made it. */
function useWrite() {
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const run = async (write: () => Promise<void>, after?: () => void) => {
		setError(null);
		setBusy(true);
		try {
			await write();
			after?.();
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : "Couldn't save the change.");
		} finally {
			setBusy(false);
		}
	};
	return { error, busy, run };
}

type Mode = "view" | "edit" | "retire" | "merge";

function AttributeItem({
	attribute,
	others,
	actions,
}: {
	attribute: AttributeRow;
	others: AttributeRow[];
	actions: AttributeActions;
}) {
	const [mode, setMode] = useState<Mode>("view");
	const [label, setLabel] = useState(attribute.label);
	const [quality, setQuality] = useState(qualityOf(attribute.questionText));
	const [marketPrompt, setMarketPrompt] = useState(attribute.marketPromptText);
	const [mergeWith, setMergeWith] = useState<AttributeRow | null>(null);
	const [mergedQuality, setMergedQuality] = useState("");
	const [mergedQualities, setMergedQualities] = useState<string[]>([]);
	const [mergedPrompt, setMergedPrompt] = useState("");
	const { error, busy, run } = useWrite();
	const current = qualityOf(attribute.questionText);
	const close = () => setMode("view");

	const startMerge = (other: AttributeRow) => {
		const parts = [current, qualityOf(other.questionText)];
		setMergeWith(other);
		setMergedQualities(parts);
		setMergedQuality(parts.join(" and "));
		setMergedPrompt(attribute.marketPromptText);
	};

	return (
		<li className="space-y-3 rounded-lg border p-3">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="min-w-0 space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-medium">{attribute.label}</span>
						{attribute.questionVersion > 1 && <Badge variant="secondary">question v{attribute.questionVersion}</Badge>}
					</div>
					<p className="text-sm text-muted-foreground">{asked(attribute.questionText)}</p>
					<p className="text-sm text-muted-foreground">Market prompt: {attribute.marketPromptText}</p>
				</div>
				{mode === "view" && (
					<div className="flex flex-wrap gap-2">
						<Button variant="outline" size="sm" onClick={() => setMode("edit")}>
							Edit
						</Button>
						<Button variant="outline" size="sm" disabled={others.length === 0} onClick={() => setMode("merge")}>
							Merge…
						</Button>
						<Button variant="outline" size="sm" onClick={() => setMode("retire")}>
							Retire
						</Button>
					</div>
				)}
			</div>

			{mode === "edit" && (
				<div className="space-y-4">
					<div className="space-y-1">
						<Label htmlFor={`label-${attribute.id}`}>Name</Label>
						<div className="flex flex-wrap gap-2">
							<Input
								id={`label-${attribute.id}`}
								className="max-w-sm"
								value={label}
								onChange={(event) => setLabel(event.target.value)}
							/>
							<Button
								size="sm"
								variant="outline"
								disabled={busy || label.trim() === attribute.label}
								onClick={() => run(() => actions.rename(attribute.id, label))}
							>
								Rename
							</Button>
						</div>
						<p className="text-xs text-muted-foreground">
							Renaming changes only the name you see. The judge never reads it, and the attribute's history is kept.
						</p>
					</div>
					<div className="space-y-1">
						<Label htmlFor={`quality-${attribute.id}`}>
							The judge asks: How does this answer characterise your brand's…
						</Label>
						<Textarea
							id={`quality-${attribute.id}`}
							className="min-h-9"
							value={quality}
							onChange={(event) => setQuality(event.target.value)}
						/>
						<Warnings quality={quality} qualities={[quality]} />
						<p className="text-xs text-muted-foreground">
							Changing the question starts a new series: charts break at the change and never average across it.
						</p>
						<Button
							size="sm"
							variant="outline"
							disabled={busy || quality.trim() === current}
							onClick={() => run(() => actions.editQuestion(attribute.id, quality))}
						>
							Save as question version {attribute.questionVersion + 1}
						</Button>
					</div>
					<div className="space-y-1">
						<Label htmlFor={`market-${attribute.id}`}>
							Market prompt (a new wording starts a new prompt; the old one stops and keeps its answers)
						</Label>
						<Textarea
							id={`market-${attribute.id}`}
							className="min-h-9"
							value={marketPrompt}
							onChange={(event) => setMarketPrompt(event.target.value)}
						/>
						<Button
							size="sm"
							variant="outline"
							disabled={busy || marketPrompt.trim() === attribute.marketPromptText}
							onClick={() => run(() => actions.setMarketPrompt(attribute.id, marketPrompt))}
						>
							Save market prompt
						</Button>
					</div>
					<Button variant="ghost" size="sm" onClick={close}>
						Done
					</Button>
				</div>
			)}

			{mode === "retire" && (
				<div className="space-y-2">
					<p className="text-sm">
						Retire {attribute.label}? It leaves the judge's list and the charts' current view. Its history is kept, and
						it can't be brought back: add it again as a new attribute instead.
					</p>
					<div className="flex gap-2">
						<Button
							size="sm"
							variant="destructive"
							disabled={busy}
							onClick={() => run(() => actions.retire(attribute.id))}
						>
							Retire {attribute.label}
						</Button>
						<Button size="sm" variant="ghost" onClick={close}>
							Cancel
						</Button>
					</div>
				</div>
			)}

			{mode === "merge" && (
				<div className="space-y-3">
					{!mergeWith ? (
						<>
							<p className="text-sm">Merge which attribute into {attribute.label}?</p>
							<div className="flex flex-wrap gap-2">
								{others.map((other) => (
									<Button key={other.id} size="sm" variant="outline" onClick={() => startMerge(other)}>
										{other.label}
									</Button>
								))}
							</div>
						</>
					) : (
						<>
							<p className="text-sm">
								{attribute.label} keeps its history and asks the merged question from now on, as question version{" "}
								{attribute.questionVersion + 1}. {mergeWith.label} is retired, and its history is kept.
							</p>
							<div className="space-y-1">
								<Label htmlFor={`merged-${attribute.id}`}>
									The judge asks: How does this answer characterise your brand's…
								</Label>
								<Textarea
									id={`merged-${attribute.id}`}
									className="min-h-9"
									value={mergedQuality}
									onChange={(event) => {
										setMergedQuality(event.target.value);
										setMergedQualities([event.target.value]);
									}}
								/>
								<Warnings quality={mergedQuality} qualities={mergedQualities} />
							</div>
							<div className="space-y-1">
								<Label htmlFor={`merged-market-${attribute.id}`}>Market prompt</Label>
								<Textarea
									id={`merged-market-${attribute.id}`}
									className="min-h-9"
									value={mergedPrompt}
									onChange={(event) => setMergedPrompt(event.target.value)}
								/>
							</div>
						</>
					)}
					<div className="flex gap-2">
						{mergeWith && (
							<Button
								size="sm"
								disabled={busy}
								onClick={() =>
									run(() =>
										actions.merge({
											keepId: attribute.id,
											retireId: mergeWith.id,
											quality: mergedQuality,
											marketPromptText: mergedPrompt,
										}),
									)
								}
							>
								Merge {mergeWith.label} into {attribute.label}
							</Button>
						)}
						<Button
							size="sm"
							variant="ghost"
							onClick={() => {
								setMergeWith(null);
								close();
							}}
						>
							Cancel
						</Button>
					</div>
				</div>
			)}
			{error && <p className="text-sm text-destructive">{error}</p>}
		</li>
	);
}

function AddAttribute({
	actions,
	disabled,
	maxActive,
}: {
	actions: AttributeActions;
	disabled: boolean;
	maxActive: number;
}) {
	const [label, setLabel] = useState("");
	const [quality, setQuality] = useState("");
	const [marketPrompt, setMarketPrompt] = useState("");
	const { error, busy, run } = useWrite();
	return (
		<div className="space-y-3 rounded-lg border p-4">
			<h3 className="font-medium">Add your own</h3>
			<div className="space-y-1">
				<Label htmlFor="new-attribute-label">Name</Label>
				<Input id="new-attribute-label" value={label} onChange={(event) => setLabel(event.target.value)} />
			</div>
			<div className="space-y-1">
				<Label htmlFor="new-attribute-quality">The judge asks: How does this answer characterise your brand's…</Label>
				<Textarea
					id="new-attribute-quality"
					className="min-h-9"
					placeholder="e.g. ease of getting started"
					value={quality}
					onChange={(event) => setQuality(event.target.value)}
				/>
				{quality && <Warnings quality={quality} qualities={[quality]} />}
			</div>
			<div className="space-y-1">
				<Label htmlFor="new-attribute-market">Market prompt, naming no brand</Label>
				<Textarea
					id="new-attribute-market"
					className="min-h-9"
					placeholder="e.g. Which hosted databases are easiest to get started with?"
					value={marketPrompt}
					onChange={(event) => setMarketPrompt(event.target.value)}
				/>
			</div>
			<Button
				size="sm"
				disabled={disabled || busy || !label.trim() || !quality.trim() || !marketPrompt.trim()}
				onClick={() =>
					run(
						() => actions.add({ label, quality, marketPromptText: marketPrompt }),
						() => {
							setLabel("");
							setQuality("");
							setMarketPrompt("");
						},
					)
				}
			>
				Add attribute
			</Button>
			{disabled && (
				<p className="text-sm text-muted-foreground">
					The brand has its {maxActive} active attributes. Retire or merge one first.
				</p>
			)}
			{error && <p className="text-sm text-destructive">{error}</p>}
		</div>
	);
}

/**
 * The brand's attributes. Every change keeps history: a rename touches only the display name, a new
 * question starts a new series, and retiring or merging keeps the retired attribute's verdicts.
 */
export function PerceptionAttributesEditor({
	attributes,
	maxActive,
	headroom,
	actions,
}: {
	attributes: AttributeRow[];
	maxActive: number;
	headroom: PromptHeadroomCounts;
	actions: AttributeActions;
}) {
	const active = attributes.filter((attribute) => !attribute.retired);
	const retired = attributes.filter((attribute) => attribute.retired);
	return (
		<div className="space-y-4">
			<div>
				<h2 className="text-xl font-semibold">Attributes</h2>
				<p className="text-sm text-muted-foreground">
					{active.length} of {maxActive} active. Each one tracks a market prompt.
				</p>
				<p className="text-sm text-muted-foreground">
					Perception prompts: {headroom.perception.used} of {headroom.perception.cap}. All prompts:{" "}
					{headroom.brand.used} of {headroom.brand.cap}.
				</p>
			</div>
			{active.length === 0 ? (
				<p className="text-sm text-muted-foreground">No attributes yet. Suggest some below, or add your own.</p>
			) : (
				<ul className="space-y-3">
					{active.map((attribute) => (
						<AttributeItem
							key={`${attribute.id}-${attribute.questionVersion}-${attribute.label}-${attribute.marketPromptText}`}
							attribute={attribute}
							others={active.filter((other) => other.id !== attribute.id)}
							actions={actions}
						/>
					))}
				</ul>
			)}
			<AddAttribute actions={actions} disabled={active.length >= maxActive} maxActive={maxActive} />
			{retired.length > 0 && (
				<p className="text-sm text-muted-foreground">
					Retired: {retired.map((attribute) => attribute.label).join(", ")}. Their history is kept.
				</p>
			)}
		</div>
	);
}
