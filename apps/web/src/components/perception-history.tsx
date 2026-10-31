import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@workspace/ui/components/chart";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { formatShortDate } from "@/lib/chart-utils";
import { lineOverDays, MIN_DAY_ANSWERS } from "@/lib/perception-history";
import type { FactHistory, MarketDay, PerceptionHistory } from "@/server/perception-history-core";

const percent = (value: number) => `${Math.round(value * 100)}%`;
const day = (iso: string) =>
	new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
		new Date(`${iso}T00:00:00Z`),
	);
const list = (days: string[]) => days.map(day).join(", ");

/** One line over calendar days; a day without a value is a gap, never joined across. */
function HistoryLine({
	dates,
	values,
	label,
	format,
	lowerIsBetter = false,
}: {
	dates: string[];
	values: (number | null)[];
	label: string;
	format: (value: number) => string;
	lowerIsBetter?: boolean;
}) {
	const config: ChartConfig = { value: { label, color: "var(--chart-1)" } };
	const data = dates.map((date, i) => ({ date, value: values[i] }));
	return (
		<ChartContainer config={config} className="aspect-auto h-[160px] w-full">
			<LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
				<CartesianGrid vertical={false} />
				<XAxis
					dataKey="date"
					tickLine={false}
					axisLine={false}
					tickMargin={8}
					minTickGap={32}
					tickFormatter={formatShortDate}
				/>
				<YAxis
					tickLine={false}
					axisLine={false}
					tickMargin={8}
					width={44}
					reversed={lowerIsBetter}
					domain={lowerIsBetter ? [1, "auto"] : [0, 1]}
					tickCount={5}
					tickFormatter={format}
				/>
				<ChartTooltip
					cursor={false}
					content={
						<ChartTooltipContent
							indicator="dot"
							labelFormatter={(value) => formatShortDate(String(value))}
							formatter={(value) => format(Number(value))}
						/>
					}
				/>
				<Line
					dataKey="value"
					type="monotone"
					stroke="var(--color-value)"
					strokeWidth={2}
					dot={{ r: 3, fill: "var(--color-value)", strokeWidth: 0 }}
					connectNulls={false}
					isAnimationActive={false}
				/>
			</LineChart>
		</ChartContainer>
	);
}

function Notes({
	hiddenDays,
	changes,
	noun,
	partial,
	partialNote,
}: {
	hiddenDays: number;
	changes: string[];
	noun: string;
	partial: string[];
	partialNote: string;
}) {
	const notes = [
		hiddenDays > 0 &&
			`${hiddenDays} day${hiddenDays === 1 ? "" : "s"} not plotted: fewer than ${MIN_DAY_ANSWERS} answers.`,
		changes.length > 0 && `${noun} changed on ${list(changes)}; figures before and after aren't strictly comparable.`,
		partial.length > 0 && `${partialNote} (${partial.length > 3 ? `${partial.length} days` : list(partial)}).`,
	].filter(Boolean);
	return notes.length === 0 ? null : <p className="text-xs text-muted-foreground">{notes.join(" ")}</p>;
}

function FactSeries({ fact }: { fact: FactHistory }) {
	const line = lineOverDays(fact.days, (point) => point.stated / point.answers);
	const shown = [...fact.days].reverse().find((point) => point.answers >= MIN_DAY_ANSWERS);
	return (
		<li className="space-y-2 border-b py-4 last:border-b-0">
			<p className="font-medium">"{fact.statement}"</p>
			{line.days.length === 0 || !shown ? (
				<p className="text-sm text-muted-foreground">
					Not enough data yet: no day has {MIN_DAY_ANSWERS} answers, which is where a day's figure shows.
				</p>
			) : (
				<>
					<p className="text-sm text-muted-foreground">
						Stated in {percent(shown.stated / shown.answers)} of {shown.answers.toLocaleString("en-US")} answers on{" "}
						{day(shown.day)}, the latest day shown.
					</p>
					<HistoryLine dates={line.days} values={line.values} label="Stated" format={percent} />
					<Notes
						hiddenDays={line.hiddenDays}
						changes={fact.versionChanges}
						noun="The judge version"
						partial={fact.days.filter((point) => point.otherStampAnswers > 0).map((point) => point.day)}
						partialNote="Some answers were also judged under another version; each day's figure uses the version that covered the most answers"
					/>
				</>
			)}
		</li>
	);
}

function MarketSeries({ days, changes }: { days: MarketDay[]; changes: string[] }) {
	const share = lineOverDays(days, (point) => point.mentioned / point.answers);
	const position = lineOverDays(days, (point) => (point.positioned > 0 ? point.positionSum / point.positioned : null));
	const partial = days.filter((point) => point.otherSetAnswers > 0).map((point) => point.day);
	if (share.days.length === 0)
		return <p className="text-sm text-muted-foreground">No market answers have been judged yet for these filters.</p>;
	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<p className="text-sm font-medium">How often AI names your brand</p>
				<HistoryLine dates={share.days} values={share.values} label="Named" format={percent} />
			</div>
			<div className="space-y-2">
				<p className="text-sm font-medium">Average position when named (1 is first)</p>
				<HistoryLine
					dates={position.days}
					values={position.values}
					label="Position"
					format={(value) => value.toFixed(1)}
					lowerIsBetter
				/>
			</div>
			<Notes
				hiddenDays={share.hiddenDays}
				changes={changes}
				noun="The competitor set"
				partial={partial}
				partialNote="Some answers were ranked under another competitor set and are left out"
			/>
		</div>
	);
}

/**
 * Change over time, from the daily rollups. Each series starts on its first day of data and leaves a gap
 * for any day without enough answers, so it never implies history it doesn't have.
 */
export function PerceptionHistoryView({
	history,
	attributeControl,
}: {
	history: PerceptionHistory;
	attributeControl?: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle>How often AI states your facts, over time</CardTitle>
					<p className="text-sm text-muted-foreground">
						{history.factsFirstDay
							? `History starts on ${day(history.factsFirstDay)}; there is no data before it. `
							: "No answers have been checked against your facts yet. "}
						Days are UTC, and a day shows from {MIN_DAY_ANSWERS} answers.
					</p>
				</CardHeader>
				<CardContent>
					{history.facts.length === 0 ? (
						<p className="text-sm text-muted-foreground">Nothing to chart for these filters yet.</p>
					) : (
						<ul>
							{history.facts.map((fact) => (
								<FactSeries key={fact.factId} fact={fact} />
							))}
						</ul>
					)}
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>How AI places {history.brand}, over time</CardTitle>
					<p className="text-sm text-muted-foreground">
						{history.marketFirstDay
							? `History starts on ${day(history.marketFirstDay)}; there is no data before it. `
							: "No market answers have been judged yet. "}
						Position depends on which competitors are tracked, so the line is only comparable within one set.
					</p>
					{attributeControl}
				</CardHeader>
				<CardContent>
					<MarketSeries days={history.market.days} changes={history.market.versionChanges} />
				</CardContent>
			</Card>
		</div>
	);
}
