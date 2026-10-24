#!/usr/bin/env tsx
/**
 * PROCEDURE.md §7b's validation: compares the operator's blind labels with the AI labeller's on the
 * operator's 40 attribute items and 15 drift items, and says whether the AI labels count as gold.
 * Run it once the operator's labels are frozen. It prints only agreement figures and confusion counts,
 * never an item's label.
 *
 * Usage, from apps/worker:
 *   pnpm exec tsx scripts/attribute-agreement.ts src/perception/calibration/v1/attributes <AI labels csv>
 * The AI labels are `docs/calibration-sealed/attributes/labels.ai.csv` until the freeze, then the
 * directory's `sealed/labels.ai.csv`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const [dir, aiPath] = process.argv.slice(2);
if (!dir || !aiPath) {
	console.error("Pass the attribute half's directory and the AI labels file.");
	process.exit(1);
}

/** RFC 4180 fields: quoted (with "" for a quote) or bare, comma-separated, one record per LF. */
function parseCsv(source: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	for (const match of source.matchAll(/("(?:[^"]|"")*"|[^,\n]*)(,|\n|$)/g)) {
		if (match[0] === "") break;
		row.push(match[1].startsWith('"') ? match[1].slice(1, -1).replace(/""/g, '"') : match[1]);
		if (match[2] !== ",") {
			rows.push(row);
			row = [];
		}
	}
	return rows;
}

function labels(file: string): Map<string, { key: string; label: string }> {
	const [header, ...rows] = parseCsv(readFileSync(file, "utf8"));
	const at = (name: string) => header.indexOf(name);
	return new Map(rows.map((r) => [r[at("item_id")], { key: r[at("attribute_key")], label: r[at("label")] }]));
}

const human = labels(path.join(dir, "labels-template.csv"));
const ai = labels(aiPath);
const sample = new Set(JSON.parse(readFileSync(path.join(dir, "validation-subset.json"), "utf8")) as string[]);

type Pair = { human: string; ai: string };
const attributePairs: Pair[] = [];
const driftPairs: Pair[] = [];
const unlabelled: string[] = [];
for (const [id, row] of human) {
	const isDrift = row.key === "drift";
	if (!isDrift && !sample.has(id)) continue;
	if (!row.label) {
		unlabelled.push(id);
		continue;
	}
	const pair = { human: row.label, ai: ai.get(id)?.label ?? "" };
	(isDrift ? driftPairs : attributePairs).push(pair);
}
if (unlabelled.length > 0) {
	console.error(`${unlabelled.length} of the operator's items have no label yet.`);
	process.exit(1);
}

/** Cohen's κ, with a 95% interval from its large-sample standard error. */
function kappa(pairs: Pair[]) {
	const n = pairs.length;
	const categories = [...new Set(pairs.flatMap((p) => [p.human, p.ai]))];
	const observed = pairs.filter((p) => p.human === p.ai).length / n;
	const expected = categories.reduce(
		(sum, c) => sum + (pairs.filter((p) => p.human === c).length / n) * (pairs.filter((p) => p.ai === c).length / n),
		0,
	);
	const value = expected === 1 ? 1 : (observed - expected) / (1 - expected);
	const se = expected === 1 ? 0 : Math.sqrt((observed * (1 - observed)) / (n * (1 - expected) ** 2));
	return { n, rawAgreement: observed, kappa: value, kappa95: [value - 1.96 * se, value + 1.96 * se] };
}

/** Agreement on one label: of the items either labeller gave it, the share both gave it. */
function specificAgreement(pairs: Pair[], label: string) {
	const both = pairs.filter((p) => p.human === label && p.ai === label).length;
	const either = pairs.filter((p) => p.human === label || p.ai === label).length;
	return { both, either, agreement: either ? (2 * both) / (2 * both + (either - both)) : null };
}

const discussed = (label: string) => (label === "not_discussed" ? "not_discussed" : "discussed");
const LABELS = ["positive", "negative", "mixed", "not_discussed"];
const attributes = kappa(attributePairs);
const report = {
	attributeItems: {
		...attributes,
		labelMixHuman: Object.fromEntries(LABELS.map((l) => [l, attributePairs.filter((p) => p.human === l).length])),
		confusionHumanRowsAiColumns: Object.fromEntries(
			LABELS.map((h) => [
				h,
				Object.fromEntries(LABELS.map((a) => [a, attributePairs.filter((p) => p.human === h && p.ai === a).length])),
			]),
		),
		negative: specificAgreement(attributePairs, "negative"),
		discussedVsNot: kappa(attributePairs.map((p) => ({ human: discussed(p.human), ai: discussed(p.ai) }))),
	},
	driftItems: { ...kappa(driftPairs), yes: specificAgreement(driftPairs, "yes") },
	decision:
		attributes.rawAgreement >= 0.9 && attributes.kappa >= 0.8
			? "AI labels count as gold (raw agreement ≥ 90% and κ ≥ 0.8 on the attribute sample)"
			: "AI labels are discarded for the gate: the operator labels every item (§2a)",
	note: "The sample over-represents negative (at least 10 of 40), so these figures describe the sample, not the population.",
};
console.log(JSON.stringify(report, null, 2));
