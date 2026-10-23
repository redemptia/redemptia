import { atomicityHints, MAX_ACTIVE_FACTS, statementProblem } from "@workspace/lib/perception/fact-statement";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";

export interface FactRow {
	id: string;
	statement: string;
	category: string | null;
	validFrom: string;
	validTo: string | null;
	supersedes: string | null;
	supersededBy: string | null;
	judged: boolean;
}

export interface FactActions {
	add: (input: { statement: string; category: string | null; validFrom: string }) => Promise<void>;
	recordChange: (factId: string, input: { statement: string; effectiveFrom: string }) => Promise<void>;
	retire: (factId: string, noLongerTrueFrom: string) => Promise<void>;
	remove: (factId: string) => Promise<void>;
}

/** Each fact's current version, with the versions it replaced, newest first. */
function chains(facts: FactRow[]): { current: FactRow; history: FactRow[] }[] {
	const byId = new Map(facts.map((fact) => [fact.id, fact]));
	return facts
		.filter((fact) => !fact.supersededBy)
		.map((current) => {
			const history: FactRow[] = [];
			let previous = current.supersedes ? byId.get(current.supersedes) : undefined;
			while (previous) {
				history.push(previous);
				previous = previous.supersedes ? byId.get(previous.supersedes) : undefined;
			}
			return { current, history };
		});
}

const dayFormat = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "UTC",
});

/** A `YYYY-MM-DD` day as "1 Sep 2026": unambiguous in every locale, unlike 01/09/2026. */
function formatDay(day: string): string {
	return dayFormat.format(new Date(`${day}T00:00:00Z`));
}

function dayBefore(day: string): string {
	const date = new Date(`${day}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() - 1);
	return date.toISOString().slice(0, 10);
}

function range(fact: FactRow): string {
	return fact.validTo
		? `True ${formatDay(fact.validFrom)} to ${formatDay(fact.validTo)}`
		: `True from ${formatDay(fact.validFrom)}`;
}

/** Runs a write and turns its failure into the message to show, or null on success. */
async function attempt(write: () => Promise<void>): Promise<string | null> {
	try {
		await write();
		return null;
	} catch (error) {
		return error instanceof Error && error.message ? error.message : "That didn't save. Try again.";
	}
}

function StatementHints({ statement }: { statement: string }) {
	const hints = atomicityHints(statement);
	if (hints.length === 0) return null;
	return (
		<div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
			<p className="font-medium">This looks like more than one claim.</p>
			<ul className="mt-1 list-disc pl-5">
				{hints.map((hint) => (
					<li key={hint}>{hint}</li>
				))}
			</ul>
			<p className="mt-1">
				One claim per fact keeps verdicts unambiguous. Edit it down to one claim and add the rest as separate facts, or
				keep it as one fact.
			</p>
		</div>
	);
}

function AddFact({ today, onAdd, full }: { today: string; onAdd: FactActions["add"]; full: boolean }) {
	const [statement, setStatement] = useState("");
	const [category, setCategory] = useState("");
	const [validFrom, setValidFrom] = useState(today);
	const [confirmedAsOne, setConfirmedAsOne] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const problem = statement.trim() ? statementProblem(statement) : null;
	const needsConfirm = atomicityHints(statement).length > 0 && !confirmedAsOne;

	const submit = async () => {
		setSaving(true);
		const failure = await attempt(() => onAdd({ statement, category: category.trim() || null, validFrom }));
		setSaving(false);
		setError(failure);
		if (!failure) {
			setStatement("");
			setCategory("");
			setValidFrom(today);
			setConfirmedAsOne(false);
		}
	};

	return (
		<div className="space-y-3 rounded-lg border p-4">
			<div className="space-y-1">
				<Label htmlFor="fact-statement">New fact</Label>
				<Input
					id="fact-statement"
					placeholder="Acme's Pro plan starts at $25 per month."
					value={statement}
					onChange={(event) => {
						setStatement(event.target.value);
						setConfirmedAsOne(false);
					}}
					disabled={full || saving}
				/>
				{problem && <p className="text-sm text-destructive">{problem}</p>}
			</div>
			<StatementHints statement={statement} />
			<div className="flex flex-wrap gap-3">
				<div className="space-y-1">
					<Label htmlFor="fact-category">Category (optional)</Label>
					<Input
						id="fact-category"
						placeholder="pricing"
						value={category}
						onChange={(event) => setCategory(event.target.value)}
						disabled={full || saving}
					/>
				</div>
				<div className="space-y-1">
					<Label htmlFor="fact-valid-from">True from</Label>
					<Input
						id="fact-valid-from"
						type="date"
						max={today}
						value={validFrom}
						onChange={(event) => setValidFrom(event.target.value)}
						disabled={full || saving}
					/>
				</div>
			</div>
			{error && <p className="text-sm text-destructive">{error}</p>}
			<div className="flex gap-2">
				{needsConfirm ? (
					<Button variant="outline" onClick={() => setConfirmedAsOne(true)} disabled={!!problem || saving}>
						Keep as one fact
					</Button>
				) : (
					<Button onClick={submit} disabled={full || !statement.trim() || !!problem || saving}>
						Add fact
					</Button>
				)}
			</div>
		</div>
	);
}

function ChangeDialog({
	fact,
	today,
	onClose,
	onRecord,
}: {
	fact: FactRow;
	today: string;
	onClose: () => void;
	onRecord: FactActions["recordChange"];
}) {
	const [statement, setStatement] = useState("");
	const [effectiveFrom, setEffectiveFrom] = useState(today);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const problem = statement.trim() ? statementProblem(statement) : null;
	const tooEarly = effectiveFrom !== "" && effectiveFrom <= fact.validFrom;

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Record a change</DialogTitle>
					<DialogDescription>
						This creates a new dated record.
						{effectiveFrom && !tooEarly && (
							<>
								{" "}
								Answers from {formatDay(effectiveFrom)} on are checked against the new statement. Answers before then
								are still checked against the current one, which stays true until {formatDay(dayBefore(effectiveFrom))}.
							</>
						)}
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<div className="space-y-1">
						<Label>Current statement</Label>
						<p className="rounded-md bg-muted p-2 text-sm">{fact.statement}</p>
					</div>
					<div className="space-y-1">
						<Label htmlFor="change-statement">New statement</Label>
						<Input id="change-statement" value={statement} onChange={(event) => setStatement(event.target.value)} />
						{problem && <p className="text-sm text-destructive">{problem}</p>}
					</div>
					<StatementHints statement={statement} />
					<div className="space-y-1">
						<Label htmlFor="change-from">The change took effect on</Label>
						<Input
							id="change-from"
							type="date"
							max={today}
							value={effectiveFrom}
							onChange={(event) => setEffectiveFrom(event.target.value)}
						/>
						{tooEarly && (
							<p className="text-sm text-destructive">
								Pick a day after {formatDay(fact.validFrom)}, when the current statement became true. A fact entered by
								mistake today can be deleted instead.
							</p>
						)}
					</div>
					{error && <p className="text-sm text-destructive">{error}</p>}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button
						disabled={!statement.trim() || !!problem || tooEarly || saving}
						onClick={async () => {
							setSaving(true);
							const failure = await attempt(() => onRecord(fact.id, { statement, effectiveFrom }));
							setSaving(false);
							setError(failure);
							if (!failure) onClose();
						}}
					>
						Record change
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function RetireDialog({
	fact,
	today,
	onClose,
	onRetire,
}: {
	fact: FactRow;
	today: string;
	onClose: () => void;
	onRetire: FactActions["retire"];
}) {
	const [from, setFrom] = useState(today);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const tooEarly = from !== "" && from <= fact.validFrom;

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Retire this fact</DialogTitle>
					<DialogDescription>
						Answers given while it was true are still checked against it. From the date below it is no longer checked.
						{from && !tooEarly && <> Its last true day will be {formatDay(dayBefore(from))}.</>}
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<p className="rounded-md bg-muted p-2 text-sm">{fact.statement}</p>
					<div className="space-y-1">
						<Label htmlFor="retire-from">No longer true from</Label>
						<Input
							id="retire-from"
							type="date"
							max={today}
							value={from}
							onChange={(event) => setFrom(event.target.value)}
						/>
						{tooEarly && (
							<p className="text-sm text-destructive">
								Pick a day after {formatDay(fact.validFrom)}, when this fact became true.
							</p>
						)}
					</div>
					{error && <p className="text-sm text-destructive">{error}</p>}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button
						disabled={!from || tooEarly || saving}
						onClick={async () => {
							setSaving(true);
							const failure = await attempt(() => onRetire(fact.id, from));
							setSaving(false);
							setError(failure);
							if (!failure) onClose();
						}}
					>
						Retire
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function FactItem({
	current,
	history,
	today,
	actions,
}: {
	current: FactRow;
	history: FactRow[];
	today: string;
	actions: FactActions;
}) {
	const [dialog, setDialog] = useState<"change" | "retire" | null>(null);
	const [showHistory, setShowHistory] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const active = current.validTo === null;
	// Only a fact recorded by mistake: unchanged, unsuperseded and never used to judge an answer.
	const deletable = !current.judged && !current.supersedes && !current.supersededBy;

	return (
		<li className="space-y-2 rounded-lg border p-3">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="min-w-0 flex-1 basis-80 space-y-1">
					<p className="font-medium">{current.statement}</p>
					<p className="text-sm text-muted-foreground">
						{range(current)}
						{current.category && (
							<Badge variant="secondary" className="ml-2">
								{current.category}
							</Badge>
						)}
					</p>
				</div>
				{active && (
					<div className="flex flex-wrap gap-2">
						<Button size="sm" variant="outline" onClick={() => setDialog("change")}>
							Record a change
						</Button>
						<Button size="sm" variant="outline" onClick={() => setDialog("retire")}>
							Retire
						</Button>
						{deletable && (
							<Button
								size="sm"
								variant="ghost"
								className="text-destructive hover:text-destructive"
								onClick={async () => setError(await attempt(() => actions.remove(current.id)))}
							>
								Delete
							</Button>
						)}
					</div>
				)}
			</div>
			{error && <p className="text-sm text-destructive">{error}</p>}
			{history.length > 0 && (
				<div>
					<Button size="sm" variant="link" className="px-0" onClick={() => setShowHistory(!showHistory)}>
						{showHistory ? "Hide" : "Show"} {history.length} earlier version{history.length === 1 ? "" : "s"}
					</Button>
					{showHistory && (
						<ul className="mt-1 space-y-1 border-l pl-3 text-sm text-muted-foreground">
							{history.map((version) => (
								<li key={version.id}>
									<span className="text-foreground">{version.statement}</span> · {range(version)}
								</li>
							))}
						</ul>
					)}
				</div>
			)}
			{dialog === "change" && (
				<ChangeDialog fact={current} today={today} onClose={() => setDialog(null)} onRecord={actions.recordChange} />
			)}
			{dialog === "retire" && (
				<RetireDialog fact={current} today={today} onClose={() => setDialog(null)} onRetire={actions.retire} />
			)}
		</li>
	);
}

export function PerceptionFactsEditor({
	facts,
	today,
	actions,
}: {
	facts: FactRow[];
	today: string;
	actions: FactActions;
}) {
	const all = chains(facts);
	const active = all.filter((chain) => chain.current.validTo === null);
	const ended = all.filter((chain) => chain.current.validTo !== null);
	const full = active.length >= MAX_ACTIVE_FACTS;

	return (
		<div className="space-y-4">
			<div className="flex items-baseline justify-between">
				<h2 className="text-xl font-semibold">Facts</h2>
				<span className="text-sm text-muted-foreground">
					{active.length} of {MAX_ACTIVE_FACTS} active
				</span>
			</div>
			<p className="text-sm text-muted-foreground">
				Each fact is a dated record of one claim about your brand. AI answers are checked against the version that was
				true on the day they were given. Facts are never edited: a change is recorded as a new version.
			</p>
			<AddFact today={today} onAdd={actions.add} full={full} />
			{full && <p className="text-sm text-muted-foreground">Retire a fact to add another.</p>}
			{all.length === 0 && (
				<p className="text-sm text-muted-foreground">
					No facts yet. Start with what buyers ask about most: price, integrations, where it runs.
				</p>
			)}
			{active.length > 0 && (
				<ul className="space-y-2">
					{active.map((chain) => (
						<FactItem key={chain.current.id} {...chain} today={today} actions={actions} />
					))}
				</ul>
			)}
			{ended.length > 0 && (
				<div className="space-y-2">
					<h3 className="text-sm font-medium text-muted-foreground">Retired</h3>
					<ul className="space-y-2">
						{ended.map((chain) => (
							<FactItem key={chain.current.id} {...chain} today={today} actions={actions} />
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
