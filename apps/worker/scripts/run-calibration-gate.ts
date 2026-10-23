#!/usr/bin/env tsx
/**
 * Checkpoint 4: runs the perception judge once over a frozen calibration corpus and scores it against
 * the gold labels (PROCEDURE.md §7). Each worksheet answer gets one Jev call carrying a question for
 * every fact it is labelled against, built exactly as the perception job builds them.
 *
 * Paid, once: about one call per answer. The script refuses to call the judge again once `gate/`
 * holds responses; `--score` recomputes the report from them without calling anyone.
 *
 * Usage (reads TYPESAFE_API_KEY from the environment only; never loads .env):
 *   cd apps/worker
 *   TYPESAFE_API_KEY=... pnpm exec tsx scripts/run-calibration-gate.ts src/perception/calibration/v1 [--score]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { JEV_MODEL, type JevRequest, typesafeTransport } from "../src/mention-judge/jev";
import { FACT_VERDICTS, factKey, factQuestion } from "../src/perception/fact-questions";
import { MAX_ANSWER_CHARS } from "../src/perception/judge-runs";

const ATTRIBUTION =
	"Labels AI-generated, validated against 40 blind human labels at 90.0% agreement and Cohen's kappa 0.852.";
const SUBJECT = "Supabase";

const dir = process.argv[2];
const scoreOnly = process.argv.includes("--score");
if (!dir) fail("Pass the corpus version directory, e.g. src/perception/calibration/v1.");
const gateDir = path.join(dir, "gate");
const responsesPath = path.join(gateDir, "responses.jsonl");

const worksheet = readFileSync(path.join(dir, "worksheet.md"), "utf8");
const texts = new Map(
	[...worksheet.matchAll(/^## (W\d+)\n\n~~~~text\n([\s\S]*?)\n~~~~\n/gm)].map((m) => [m[1], m[2]] as const),
);
const facts = new Map(
	(JSON.parse(readFileSync(path.join(dir, "facts.json"), "utf8")) as { id: string; statement: string }[]).map((f) => [
		f.id,
		f.statement,
	]),
);
const key = JSON.parse(readFileSync(path.join(dir, "sealed", "worksheet-key.json"), "utf8")) as {
	answers: Record<string, { origin: string; source_id: string }>;
	items: Record<string, { answer: string; fact_id: string; set: string; perturbed: boolean }>;
};
const prompts = new Map<string, string>();
for (const file of [path.join(dir, "answers.jsonl"), path.join(dir, "sealed", "bases", "answers.jsonl")]) {
	for (const line of readFileSync(file, "utf8").split("\n").filter(Boolean)) {
		const answer = JSON.parse(line) as { id: string; prompt: string };
		prompts.set(answer.id, answer.prompt);
		prompts.set(answer.id.split("-")[0], answer.prompt);
	}
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
const [header, ...goldRows] = parseCsv(readFileSync(path.join(dir, "sealed", "labels.ai.csv"), "utf8"));
const gold = new Map(goldRows.map((cells) => [cells[header.indexOf("item_id")], cells[header.indexOf("label")]]));

interface Judged {
	answer: string;
	status: number | "error";
	model?: string;
	usage?: { input_tokens: number; output_tokens: number };
	answers?: Record<string, { choice: string; confidence?: number; probabilities: Record<string, number> }>;
	error?: string;
}

async function judgeAll(apiKey: string): Promise<void> {
	if (existsSync(responsesPath)) fail(`${responsesPath} exists: the gate runs once. Use --score to report again.`);
	mkdirSync(gateDir, { recursive: true });
	const transport = typesafeTransport(apiKey);
	for (const [answer, text] of texts) {
		const items = Object.values(key.items).filter((item) => item.answer === answer);
		const questions = Object.fromEntries(
			items.map((item) => [factKey(item.fact_id), factQuestion(SUBJECT, facts.get(item.fact_id) as string)]),
		);
		const source = key.answers[answer].source_id;
		const request: JevRequest = {
			model: JEV_MODEL,
			state: { question: prompts.get(source) ?? "", answer: text.slice(0, MAX_ANSWER_CHARS) },
			questions,
		};
		let judged: Judged;
		try {
			const response = (await transport(request)) as Judged & { answers: NonNullable<Judged["answers"]> };
			judged = { answer, status: 200, model: response.model, usage: response.usage, answers: response.answers };
		} catch (error) {
			judged = { answer, status: "error", error: String(error).slice(0, 500) };
		}
		writeFileSync(responsesPath, `${JSON.stringify(judged)}\n`, { flag: "a" });
		console.log(`${answer}: ${judged.status}${judged.usage ? ` (${judged.usage.input_tokens} in)` : ""}`);
	}
}

/** Wilson 95% interval for k successes in n. */
function wilson(k: number, n: number): [number, number] | null {
	if (n === 0) return null;
	const z = 1.96;
	const p = k / n;
	const centre = (p + (z * z) / (2 * n)) / (1 + (z * z) / n);
	const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
	return [centre - half, centre + half];
}

function quartiles(values: number[]) {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
	return { n: values.length, min: sorted[0], q1: at(0.25), median: at(0.5), q3: at(0.75), max: sorted.at(-1) };
}

function score(): void {
	const judged = readFileSync(responsesPath, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as Judged);
	const byAnswer = new Map(judged.map((j) => [j.answer, j]));
	const rows = Object.entries(key.items).map(([itemId, item]) => {
		const answer = byAnswer.get(item.answer)?.answers?.[factKey(item.fact_id)];
		return {
			itemId,
			set: item.set,
			gold: gold.get(itemId),
			predicted: answer?.choice,
			confidence: answer?.confidence,
		};
	});
	const judgedRows = rows.filter((row) => row.predicted);
	const labels = [...FACT_VERDICTS];
	const confusion = Object.fromEntries(
		labels.map((g) => [
			g,
			Object.fromEntries(labels.map((p) => [p, judgedRows.filter((r) => r.gold === g && r.predicted === p).length])),
		]),
	);
	const perLabel = Object.fromEntries(
		labels.map((label) => {
			const tp = judgedRows.filter((r) => r.gold === label && r.predicted === label).length;
			const predicted = judgedRows.filter((r) => r.predicted === label).length;
			const actual = judgedRows.filter((r) => r.gold === label).length;
			return [
				label,
				{ tp, predicted, actual, precision: predicted ? tp / predicted : null, recall: actual ? tp / actual : null },
			];
		}),
	);
	const contradicts = (subset: typeof judgedRows) => {
		const tp = subset.filter((r) => r.gold === "contradicts" && r.predicted === "contradicts").length;
		const predicted = subset.filter((r) => r.predicted === "contradicts").length;
		const actual = subset.filter((r) => r.gold === "contradicts").length;
		return {
			items: subset.length,
			prevalence: subset.length ? actual / subset.length : null,
			precision: predicted ? tp / predicted : null,
			precision95: wilson(tp, predicted),
			recall: actual ? tp / actual : null,
			recall95: wilson(tp, actual),
			tp,
			predicted,
			actual,
		};
	};
	const enriched = contradicts(judgedRows);
	const natural = contradicts(judgedRows.filter((r) => r.set === "natural"));
	const passes =
		enriched.precision !== null &&
		enriched.precision95 !== null &&
		enriched.recall !== null &&
		enriched.recall95 !== null &&
		enriched.precision >= 0.85 &&
		enriched.precision95[0] >= 0.75 &&
		enriched.recall >= 0.7 &&
		enriched.recall95[0] >= 0.6;
	const confidence = {
		correct: quartiles(
			judgedRows
				.filter((r) => r.predicted === r.gold && typeof r.confidence === "number")
				.map((r) => r.confidence as number),
		),
		wrong: quartiles(
			judgedRows
				.filter((r) => r.predicted !== r.gold && typeof r.confidence === "number")
				.map((r) => r.confidence as number),
		),
	};
	const report = {
		attribution: ATTRIBUTION,
		recallNote:
			"Recall is measured on planted contradictions only (the AI labeller found no natural contradiction), so it is optimistic.",
		judge: [...new Set(judged.map((j) => j.model))],
		calls: judged.length,
		failedCalls: judged.filter((j) => j.status !== 200).map((j) => ({ answer: j.answer, error: j.error })),
		itemsJudged: judgedRows.length,
		itemsTotal: rows.length,
		usage: judged.reduce(
			(sum, j) => ({
				input: sum.input + (j.usage?.input_tokens ?? 0),
				output: sum.output + (j.usage?.output_tokens ?? 0),
			}),
			{ input: 0, output: 0 },
		),
		thresholds: { precision: 0.85, precisionLower95: 0.75, recall: 0.7, recallLower95: 0.6 },
		contradictsEnriched: enriched,
		contradictsNaturalOnly: natural,
		gate: passes ? "pass" : "fail",
		confusionGoldRowsJudgeColumns: confusion,
		perLabel,
		confidenceByCorrectness: confidence,
	};
	writeFileSync(path.join(gateDir, "results.json"), `${JSON.stringify(report, null, "\t")}\n`);
	console.log(JSON.stringify(report, null, 2));
}

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

async function main() {
	if (!scoreOnly) {
		const apiKey = process.env.TYPESAFE_API_KEY?.trim();
		if (!apiKey || apiKey === "stub") fail("Set a real TYPESAFE_API_KEY; the gate measures the real judge.");
		await judgeAll(apiKey);
	}
	score();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
