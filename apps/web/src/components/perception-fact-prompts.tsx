import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";

export interface FactPromptRow {
	id: string;
	value: string;
	enabled: boolean;
}

export interface Headroom {
	perception: { used: number; cap: number };
	brand: { used: number; cap: number };
	factPrompts: number;
	factPromptStart: number;
}

/** The questions whose answers are checked against the brand's facts, and room left under both caps. */
export function PerceptionFactPrompts({
	prompts,
	headroom,
	onAdd,
	onStop,
}: {
	prompts: FactPromptRow[];
	headroom: Headroom;
	onAdd: (question: string) => Promise<void>;
	onStop: (promptId: string) => Promise<void>;
}) {
	const [question, setQuestion] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const full = headroom.perception.used >= headroom.perception.cap || headroom.brand.used >= headroom.brand.cap;
	const run = async (write: () => Promise<void>, after?: () => void) => {
		setSaving(true);
		setError(null);
		try {
			await write();
			after?.();
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : "That didn't save.");
		}
		setSaving(false);
	};

	return (
		<div className="space-y-4">
			<div>
				<h2 className="text-xl font-semibold">Fact prompts</h2>
				<p className="text-sm text-muted-foreground">
					Questions a buyer would ask an AI assistant. Each runs on your enabled models at your brand's schedule, and
					its answers are checked against your facts. Start with about {headroom.factPromptStart}.
				</p>
			</div>
			<dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
				<div className="rounded-md border p-2">
					<dt className="text-muted-foreground">Fact prompts</dt>
					<dd className="font-medium">{headroom.factPrompts}</dd>
				</div>
				<div className="rounded-md border p-2">
					<dt className="text-muted-foreground">Perception prompts</dt>
					<dd className="font-medium">
						{headroom.perception.used} of {headroom.perception.cap}
					</dd>
				</div>
				<div className="rounded-md border p-2">
					<dt className="text-muted-foreground">All prompts for this brand</dt>
					<dd className="font-medium">
						{headroom.brand.used} of {headroom.brand.cap}
					</dd>
				</div>
			</dl>
			{prompts.length > 0 && (
				<ul className="space-y-2">
					{prompts.map((prompt) => (
						<li key={prompt.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
							<span className={prompt.enabled ? "" : "text-muted-foreground"}>
								{prompt.value}
								{!prompt.enabled && " (stopped)"}
							</span>
							{prompt.enabled && (
								<Button size="sm" variant="outline" disabled={saving} onClick={() => run(() => onStop(prompt.id))}>
									Stop asking
								</Button>
							)}
						</li>
					))}
				</ul>
			)}
			<div className="space-y-1">
				<Label htmlFor="fact-prompt">New question</Label>
				<div className="flex gap-2">
					<Input
						id="fact-prompt"
						placeholder="Is Acme self-hostable?"
						value={question}
						disabled={full || saving}
						onChange={(event) => setQuestion(event.target.value)}
					/>
					<Button
						disabled={full || saving || !question.trim()}
						onClick={() =>
							run(
								() => onAdd(question),
								() => setQuestion(""),
							)
						}
					>
						Add
					</Button>
				</div>
				{full && <p className="text-sm text-muted-foreground">Stop asking a question to add another.</p>}
			</div>
			{error && <p className="text-sm text-destructive">{error}</p>}
		</div>
	);
}
