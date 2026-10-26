#!/usr/bin/env tsx
/**
 * PROCEDURE.md §7b's validation: compares the operator's blind labels with the AI labeller's on the
 * operator's 15 hard attribute items and 15 drift items, and says whether the AI attribute labels count
 * as gold. Drift's gold is the operator's own labels, so drift agreement is reported, not decided on.
 * Run it once the operator's labels are frozen. It prints only agreement figures and confusion counts,
 * never an item's label.
 *
 * It reads both parts when the second exists: `labels-template-2.csv` against `labels.ai-2.csv`, on the
 * items `validation-subset-2.json` names (drift items included).
 *
 * Usage, from apps/worker:
 *   pnpm exec tsx scripts/attribute-agreement.ts src/perception/calibration/v1/attributes <AI labels directory>
 * The AI labels are in `docs/calibration-sealed/attributes/` until the freeze, then in the directory's
 * `sealed/`.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const [dir, aiDir] = process.argv.slice(2);
if (!dir || !aiDir) {
	console.error("Pass the attribute half's directory and the directory holding the AI labels.");
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

type Pair = { human: string; ai: string };
const attributePairs: Pair[] = [];
const driftPairs: Pair[] = [];
const unlabelled: string[] = [];
/** Part 1 shows every drift item beside its sample; part 2's sample names each item to show. */
const parts = [
	{ human: "labels-template.csv", ai: "labels.ai.csv", sample: "validation-subset.json", allDrift: true },
	{ human: "labels-template-2.csv", ai: "labels.ai-2.csv", sample: "validation-subset-2.json", allDrift: false },
].filter((part) => existsSync(path.join(dir, part.sample)));
for (const part of parts) {
	const human = labels(path.join(dir, part.human));
	const ai = labels(path.join(aiDir, part.ai));
	const sample = new Set(JSON.parse(readFileSync(path.join(dir, part.sample), "utf8")) as string[]);
	for (const [id, row] of human) {
		const isDrift = row.key === "drift";
		if (!sample.has(id) && !(isDrift && part.allDrift)) continue;
		if (!row.label) {
			unlabelled.push(id);
			continue;
		}
		(isDrift ? driftPairs : attributePairs).push({ human: row.label, ai: ai.get(id)?.label ?? "" });
	}
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

/**
 * §7b's rule: at least 90% of the hard items in agreement (14 of 15; 27 of 30), and at most one
 * disagreement on negative per 15 items. κ is reported beside it, never decided on.
 */
function decide(pairs: Pair[]): string {
	const agree = pairs.filter((p) => p.human === p.ai).length;
	const negative = specificAgreement(pairs, "negative");
	const negativeDisagreements = negative.either - negative.both;
	const needed = Math.ceil(0.9 * pairs.length);
	const allowed = Math.floor(pairs.length / 15);
	const counts = `${agree} of ${pairs.length} in agreement (${needed} needed), ${negativeDisagreements} disagreements on negative (${allowed} allowed)`;
	return agree >= needed && negativeDisagreements <= allowed
		? `AI attribute labels count as gold: ${counts}`
		: `AI attribute labels are discarded, and the operator labels every natural attribute item: ${counts}`;
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
	decision: decide(attributePairs),
	note: "A hard sample (10 negatives, 5 discussed-boundary items): κ and agreement describe these items, not the population.",
};
console.log(JSON.stringify(report, null, 2));
