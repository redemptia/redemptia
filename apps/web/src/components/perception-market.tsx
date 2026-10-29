import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import type { AttributeSources, MarketProminence, ProminenceCell } from "@/server/perception-prominence-core";

/** Below this many judged answers a cell is not shown at all (SPEC §11.4 rule 2). */
export const MIN_ANSWERS = 10;

const percent = (k: number, n: number) => `${Math.round((100 * k) / n)}%`;

function Cell({ cell }: { cell: ProminenceCell }) {
	if (cell.answers < MIN_ANSWERS || cell.prominence === null) {
		return <td className="px-3 py-2 text-center text-muted-foreground">—</td>;
	}
	const meanPosition = cell.positioned ? (cell.positionSum / cell.positioned).toFixed(1) : null;
	return (
		<td
			className="px-3 py-2 text-center"
			// Shade by prominence on one hue, so the grid reads as a heatmap without a second color scale.
			style={{
				backgroundColor: `color-mix(in oklch, var(--primary) ${Math.round(cell.prominence * 0.3)}%, transparent)`,
			}}
		>
			<div className="font-medium tabular-nums">{Math.round(cell.prominence)}</div>
			<div className="text-xs text-foreground/80 tabular-nums">
				named {percent(cell.mentioned, cell.answers)}
				{meanPosition ? ` · #${meanPosition}` : ""}
			</div>
		</td>
	);
}

function Heatmap({ prominence }: { prominence: MarketProminence }) {
	const subjects = [prominence.brand, ...(prominence.competitorSet?.competitors ?? [])];
	const rows = prominence.rows.filter((row) => !row.retired);
	return (
		<Card>
			<CardHeader>
				<CardTitle>Brand comparison by attribute</CardTitle>
				<CardDescription>
					How each brand places when AI is asked about the market on each attribute. A higher score means the brand
					tends to be named, and named earlier: 100 × the average of 1 / its position across answers, counting 0 when it
					isn't named. Beside it, how often it's named and its average position when named.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				{prominence.competitorSet && (
					<p className="text-sm text-muted-foreground">
						Measured against {prominence.competitorSet.competitors.join(", ")} (competitor set{" "}
						{prominence.competitorSet.fingerprint}). Position is a rank within this competitor set only — adding or
						removing a competitor changes every brand's rank.
						{prominence.otherSetAnswers > 0 &&
							` ${prominence.otherSetAnswers} answers judged against an earlier competitor set aren't included.`}
					</p>
				)}
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b">
								<th className="px-3 py-2 text-left font-medium">Attribute</th>
								{subjects.map((subject) => (
									<th key={subject} className="px-3 py-2 text-center font-medium">
										{subject}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => {
								const answers = row.cells[prominence.brand]?.answers ?? 0;
								return (
									<tr key={row.attributeKey} className="border-b last:border-0">
										<td className="px-3 py-2">
											<div>{row.label}</div>
											<div className="text-xs text-muted-foreground">
												n = {answers} answers · {row.cells[prominence.brand]?.distinctModelOrderings ?? 0} orderings
											</div>
										</td>
										{subjects.map((subject) => (
											<Cell key={subject} cell={row.cells[subject]} />
										))}
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
				<p className="text-xs text-muted-foreground">
					Market prominence, 0–100. — means fewer than {MIN_ANSWERS} judged answers. Days are UTC. No gap column: the
					gap compares how AI describes your brand when asked about it with how it places you when asked about the
					market, and the first of those hasn't passed validation.
				</p>
			</CardContent>
		</Card>
	);
}

/** The brand's place among the tracked brands on an attribute, when every cell has enough answers to rank. */
function rankOf(prominence: MarketProminence, attributeKey: string): string | null {
	const row = prominence.rows.find((r) => r.attributeKey === attributeKey);
	if (!row) return null;
	const cells = Object.entries(row.cells);
	if (cells.some(([, cell]) => cell.answers < MIN_ANSWERS || cell.prominence === null)) return null;
	const ranked = cells.sort((a, b) => (b[1].prominence ?? 0) - (a[1].prominence ?? 0)).map(([subject]) => subject);
	return `#${ranked.indexOf(prominence.brand) + 1} of ${ranked.length}`;
}

function Sources({ prominence, sources }: { prominence: MarketProminence; sources: AttributeSources[] }) {
	const labels = new Map(prominence.rows.map((row) => [row.attributeKey, row]));
	const active = sources.filter((s) => labels.get(s.attributeKey) && !labels.get(s.attributeKey)?.retired);
	return (
		<Card>
			<CardHeader>
				<CardTitle>Attributes and sources</CardTitle>
				<CardDescription>
					Where your brand places on each attribute, and the pages the answers cite: the share of answers to that
					attribute's market prompt that cite each one.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{active.map((attribute) => {
					const rank = rankOf(prominence, attribute.attributeKey);
					const promRow = prominence.rows.find((r) => r.attributeKey === attribute.attributeKey);
					const orderings = promRow?.cells[prominence.brand]?.distinctModelOrderings ?? 0;
					return (
						<div key={attribute.attributeKey} className="space-y-2">
							<div className="flex flex-wrap items-baseline justify-between gap-2">
								<h3 className="font-medium">{labels.get(attribute.attributeKey)?.label}</h3>
								<span className="text-sm text-muted-foreground">
									{rank ?? "not enough answers to rank"} · n = {attribute.answers} answers · {orderings} orderings
								</span>
							</div>
							{attribute.answers < MIN_ANSWERS ? (
								<p className="text-sm text-muted-foreground">
									Not enough answers yet: sources show from {MIN_ANSWERS}.
								</p>
							) : attribute.sources.length === 0 ? (
								<p className="text-sm text-muted-foreground">No answer cited a page.</p>
							) : (
								<ul className="space-y-1 text-sm">
									{attribute.sources.map((source) => (
										<li key={source.url} className="flex flex-wrap justify-between gap-2">
											<a
												href={source.url}
												target="_blank"
												rel="noreferrer"
												className="min-w-0 truncate underline-offset-2 hover:underline"
											>
												{source.title || source.url}
												<span className="ml-2 text-muted-foreground">{source.domain}</span>
											</a>
											<span className="text-muted-foreground tabular-nums">
												{source.citingAnswers} of {attribute.answers} answers (
												{percent(source.citingAnswers, attribute.answers)})
											</span>
										</li>
									))}
								</ul>
							)}
						</div>
					);
				})}
			</CardContent>
		</Card>
	);
}

interface OverviewStat {
	label: string;
	value: string;
	detail: string;
}

function rankableRows(prominence: MarketProminence) {
	return prominence.rows.filter(
		(row) =>
			!row.retired &&
			row.cells[prominence.brand]?.answers !== undefined &&
			row.cells[prominence.brand].answers >= MIN_ANSWERS &&
			row.cells[prominence.brand].prominence !== null,
	);
}

function strongestAttribute(prominence: MarketProminence, rows: typeof prominence.rows): OverviewStat | null {
	if (!rows.length) return null;
	const best = rows.reduce((a, b) =>
		(a.cells[prominence.brand]?.prominence ?? 0) >= (b.cells[prominence.brand]?.prominence ?? 0) ? a : b,
	);
	const cell = best.cells[prominence.brand];
	if (!cell) return null;
	return {
		label: "Strongest Attribute",
		value: best.label,
		detail: `Prominence ${Math.round(cell.prominence ?? 0)} · named ${percent(cell.mentioned, cell.answers)} · n = ${cell.answers} answers · ${cell.distinctModelOrderings} orderings`,
	};
}

function strongestCompetitor(prominence: MarketProminence, rows: typeof prominence.rows): OverviewStat | null {
	const competitors = prominence.competitorSet?.competitors ?? [];
	if (!competitors.length || !rows.length) return null;
	const wins: Record<string, number> = Object.fromEntries(competitors.map((c) => [c, 0]));
	const led: Record<string, typeof rows> = Object.fromEntries(competitors.map((c) => [c, []]));
	for (const row of rows) {
		const brandScore = row.cells[prominence.brand]?.prominence ?? 0;
		for (const c of competitors) {
			const cell = row.cells[c];
			if (cell && cell.answers >= MIN_ANSWERS && (cell.prominence ?? 0) > brandScore) {
				wins[c]++;
				led[c].push(row);
			}
		}
	}
	const top = competitors.reduce((a, b) => ((wins[a] ?? 0) >= (wins[b] ?? 0) ? a : b));
	if ((wins[top] ?? 0) === 0) return null;
	const cells = led[top].map((row) => row.cells[prominence.brand]);
	const minAnswers = Math.min(...cells.map((c) => c.answers));
	const minOrderings = Math.min(...cells.map((c) => c.distinctModelOrderings));
	return {
		label: "Strongest Competitor",
		value: top,
		detail: `Leads on ${wins[top]} of ${rows.length} attributes · n ≥ ${minAnswers} answers · ≥ ${minOrderings} orderings per attribute`,
	};
}

function deriveOverviewCards(prominence: MarketProminence): OverviewStat[] {
	const rows = rankableRows(prominence);
	return [strongestAttribute(prominence, rows), strongestCompetitor(prominence, rows)].filter(
		(c): c is OverviewStat => c !== null,
	);
}

function OverviewCards({ prominence }: { prominence: MarketProminence }) {
	const cards = deriveOverviewCards(prominence);
	if (!cards.length) return null;
	return (
		<div className="grid gap-4 sm:grid-cols-2">
			{cards.map((card) => (
				<Card key={card.label}>
					<CardHeader className="pb-2">
						<CardDescription>{card.label}</CardDescription>
						<CardTitle className="text-2xl">{card.value}</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground">{card.detail}</p>
					</CardContent>
				</Card>
			))}
		</div>
	);
}

/** The market half of perception: prominence per attribute against the competitor set, and its sources. */
export function PerceptionMarket({
	prominence,
	sources,
}: {
	prominence: MarketProminence;
	sources: AttributeSources[];
}) {
	if (!prominence.rows.length || !sources.length) return null;
	return (
		<div className="space-y-6">
			<OverviewCards prominence={prominence} />
			<Heatmap prominence={prominence} />
			<Sources prominence={prominence} sources={sources} />
		</div>
	);
}
