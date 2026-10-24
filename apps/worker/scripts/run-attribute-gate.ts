#!/usr/bin/env tsx
/**
 * The attribute accuracy gate: runs the perception judge once over the frozen attribute half of a
 * calibration corpus and scores it against the gold labels (PROCEDURE.md §7a). Each worksheet answer
 * gets one Jev call asking every frozen attribute, built exactly as the perception job builds them;
 * association answers are also asked the drift question and its passage, as the job asks them. The
 * perturbed copies (`worksheet-perturbed.md`, labelled by a separate labeller) are judged the same way
 * and reported apart from the natural answers.
 *
 * Paid, once: one call per answer. The script refuses to call the judge again once `gate/` holds
 * responses; `--score` recomputes the report from them without calling anyone.
 *
 * Usage (reads TYPESAFE_API_KEY from the environment only; never loads .env):
 *   cd apps/worker
 *   TYPESAFE_API_KEY=... pnpm exec tsx scripts/run-attribute-gate.ts src/perception/calibration/v1/attributes [--score]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { JEV_MODEL, type JevRequest, typesafeTransport } from "../src/mention-judge/jev";
import {
	ATTRIBUTE_VERDICTS,
	attributeJudgeQuestion,
	attributeKey,
	DRIFT_EVIDENCE_KEY,
	DRIFT_KEY,
	driftEvidenceQuestion,
	driftQuestion,
} from "../src/perception/association-questions";
import { evidencePassages, NO_PASSAGE } from "../src/perception/fact-questions";
import { MAX_ANSWER_CHARS } from "../src/perception/judge-runs";

/** Filled in at the freeze from the validation result (PROCEDURE.md §7b); scoring refuses until then. */
const ATTRIBUTION = "";
const SUBJECT = { name: "Supabase", aliases: [] as string[], domains: ["https://supabase.com"] };

const dir = process.argv[2];
const scoreOnly = process.argv.includes("--score");
if (!dir) fail("Pass the attribute half's directory, e.g. src/perception/calibration/v1/attributes.");
const gateDir = path.join(dir, "gate");
const responsesPath = path.join(gateDir, "responses.jsonl");

const perturbedWorksheet = path.join(dir, "worksheet-perturbed.md");
const worksheets = [path.join(dir, "worksheet.md"), ...(existsSync(perturbedWorksheet) ? [perturbedWorksheet] : [])];
const texts = new Map(
	worksheets.flatMap((file) =>
		[...readFileSync(file, "utf8").matchAll(/^## (A\d+)\n\n~~~~text\n([\s\S]*?)\n~~~~\n/gm)].map(
			(m) => [m[1], m[2]] as const,
		),
	),
);
const attributes = JSON.parse(readFileSync(path.join(dir, "..", "attributes.json"), "utf8")) as {
	key: string;
	question_text: string;
}[];
type KeyAnswer = { answer: string; source_id: string; origin?: string };
const key = JSON.parse(readFileSync(path.join(dir, "sealed", "worksheet-key.json"), "utf8")) as {
	answers: KeyAnswer[];
	extension?: { answers: KeyAnswer[] };
};
/** The first block holds the association answers, which drift is asked of; the extension, fact-prompt answers. */
const association = new Set(key.answers.map((a) => a.answer));
const sources = new Map([...key.answers, ...(key.extension?.answers ?? [])].map((a) => [a.answer, a]));
/** Perturbed copies: which base answer each was made from, so the judge sees the base's prompt. */
const perturbedKeyPath = path.join(dir, "sealed", "perturbed-key.json");
if (existsSync(perturbedKeyPath)) {
	const perturbed = JSON.parse(readFileSync(perturbedKeyPath, "utf8")) as { answer: string; base_id: string }[];
	for (const copy of perturbed) {
		sources.set(copy.answer, { answer: copy.answer, source_id: copy.base_id, origin: "perturbed" });
	}
}
const prompts = new Map<string, string>();
for (const file of [path.join(dir, "..", "answers.jsonl"), path.join(dir, "..", "sealed", "bases", "answers.jsonl")]) {
	for (const line of readFileSync(file, "utf8").split("\n").filter(Boolean)) {
		const answer = JSON.parse(line) as { id: string; prompt: string };
		prompts.set(answer.id, answer.prompt);
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
/** Gold labels: the natural answers' and, when they exist, the perturbed copies' (labelled separately). */
const labelFiles = [
	path.join(dir, "sealed", "labels.ai.csv"),
	path.join(dir, "sealed", "labels.ai.perturbed.csv"),
].filter((file) => existsSync(file));
const items = labelFiles.flatMap((file) => {
	const [header, ...goldRows] = parseCsv(readFileSync(file, "utf8"));
	const column = (name: string) => header.indexOf(name);
	return goldRows.map((cells) => ({
		itemId: cells[column("item_id")],
		answer: cells[column("answer")],
		attributeKey: cells[column("attribute_key")],
		gold: cells[column("label")],
	}));
});

interface Judged {
	answer: string;
	status: number | "error";
	model?: string;
	usage?: { input_tokens: number; output_tokens: number };
	answers?: Record<string, { choice: string; confidence?: number; probabilities: Record<string, number> }>;
	/** The drift passages offered, so a picked passage can be read back. */
	passages?: string[];
	error?: string;
}

/** Every question for one answer, as the perception job asks them; the attribute ids are the frozen keys. */
function questionsFor(answer: string, text: string) {
	const questionTexts = attributes.map((a) => a.question_text);
	const passages = association.has(answer) ? evidencePassages(text, SUBJECT) : [];
	const questions: JevRequest["questions"] = Object.fromEntries(
		attributes.map((a) => [attributeKey(a.key), attributeJudgeQuestion(SUBJECT.name, a.question_text)]),
	);
	if (association.has(answer)) {
		questions[DRIFT_KEY] = driftQuestion(SUBJECT.name, questionTexts);
		if (passages.length > 0) {
			questions[DRIFT_EVIDENCE_KEY] = driftEvidenceQuestion(SUBJECT.name, questionTexts, passages);
		}
	}
	return { questions, passages };
}

async function judgeAll(apiKey: string): Promise<void> {
	if (existsSync(responsesPath)) fail(`${responsesPath} exists: the gate runs once. Use --score to report again.`);
	mkdirSync(gateDir, { recursive: true });
	const transport = typesafeTransport(apiKey);
	for (const [answer, full] of texts) {
		const text = full.slice(0, MAX_ANSWER_CHARS);
		const { questions, passages } = questionsFor(answer, text);
		const source = sources.get(answer)?.source_id ?? "";
		const request: JevRequest = {
			model: JEV_MODEL,
			state: { question: prompts.get(source) ?? "", answer: text },
			questions,
		};
		let judged: Judged;
		try {
			const response = (await transport(request)) as Judged & { answers: NonNullable<Judged["answers"]> };
			judged = {
				answer,
				status: 200,
				model: response.model,
				usage: response.usage,
				answers: response.answers,
				passages,
			};
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

const rate = (k: number, n: number) => ({ value: n ? k / n : null, lower95: wilson(k, n)?.[0] ?? null, k, n });

type Row = { itemId: string; answer: string; origin: string; gold: string; predicted: string };

/** §7a's measures over one set of attribute items and drift items. */
function measures(rows: Row[], drift: (Row & { passage: string | null })[]) {
	const discussed = (label: string) => label !== "not_discussed";
	const agree = rows.filter((r) => discussed(r.gold) === discussed(r.predicted)).length;
	const predDiscussed = rows.filter((r) => discussed(r.predicted));
	const goldDiscussed = rows.filter((r) => discussed(r.gold));
	const bothDiscussed = rows.filter((r) => discussed(r.gold) && discussed(r.predicted)).length;
	const negTp = rows.filter((r) => r.gold === "negative" && r.predicted === "negative").length;
	const predNeg = rows.filter((r) => r.predicted === "negative").length;
	const goldNeg = rows.filter((r) => r.gold === "negative").length;
	const driftYes = drift.filter((r) => r.predicted === "yes");
	return {
		attributeItems: rows.length,
		discussedAccuracy: rate(agree, rows.length),
		discussedPrecision: rate(bothDiscussed, predDiscussed.length),
		discussedRecall: rate(bothDiscussed, goldDiscussed.length),
		negativePrecision: rate(negTp, predNeg),
		negativeRecall: rate(negTp, goldNeg),
		driftItems: drift.length,
		driftYesPrecision: rate(driftYes.filter((r) => r.gold === "yes").length, driftYes.length),
		falseDriftYes: driftYes.filter((r) => r.gold !== "yes").map((r) => ({ item: r.itemId, passage: r.passage })),
		confusionGoldRowsJudgeColumns: Object.fromEntries(
			ATTRIBUTE_VERDICTS.map((g) => [
				g,
				Object.fromEntries(
					ATTRIBUTE_VERDICTS.map((p) => [p, rows.filter((r) => r.gold === g && r.predicted === p).length]),
				),
			]),
		),
	};
}

/** PROCEDURE.md §7a, every threshold as fixed on 24 October 2026. */
function passes(m: ReturnType<typeof measures>) {
	const at = (r: { value: number | null; lower95: number | null }, value: number, lower?: number) =>
		r.value !== null && r.value >= value && (lower === undefined || (r.lower95 !== null && r.lower95 >= lower));
	return {
		discussed: at(m.discussedAccuracy, 0.9, 0.84) && at(m.discussedPrecision, 0.85) && at(m.discussedRecall, 0.85),
		negativePrecision: at(m.negativePrecision, 0.85, 0.7),
		negativeRecall: at(m.negativeRecall, 0.7, 0.5),
		driftCorpus: at(m.driftYesPrecision, 0.8),
	};
}

/** Each gold item beside the judge's verdict on it; items the judge didn't answer are left out. */
function judgedRows(byAnswer: Map<string, Judged>) {
	const origin = (answer: string) => sources.get(answer)?.origin ?? "natural";
	const attributeRows: Row[] = [];
	const driftRows: (Row & { passage: string | null })[] = [];
	for (const item of items) {
		const response = byAnswer.get(item.answer);
		if (item.attributeKey === "drift") {
			const answer = response?.answers?.[DRIFT_KEY];
			if (!answer) continue;
			const evidence = response?.answers?.[DRIFT_EVIDENCE_KEY];
			const passage =
				evidence && evidence.choice !== NO_PASSAGE
					? (response?.passages?.[Number(evidence.choice.slice(1)) - 1] ?? null)
					: null;
			driftRows.push({ ...item, origin: origin(item.answer), predicted: answer.choice, passage });
		} else {
			const answer = response?.answers?.[attributeKey(item.attributeKey)];
			if (answer) attributeRows.push({ ...item, origin: origin(item.answer), predicted: answer.choice });
		}
	}
	return { attributeRows, driftRows };
}

function score(): void {
	if (!ATTRIBUTION) fail("Fill in ATTRIBUTION from the validation result before scoring (PROCEDURE.md §7b).");
	const judged = readFileSync(responsesPath, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as Judged);
	const { attributeRows, driftRows } = judgedRows(new Map(judged.map((j) => [j.answer, j])));
	const all = measures(attributeRows, driftRows);
	const natural = measures(
		attributeRows.filter((r) => r.origin === "natural"),
		driftRows.filter((r) => r.origin === "natural"),
	);
	const allPass = passes(all);
	const naturalPass = passes(natural);
	const corpusPass = Object.values(allPass).every(Boolean);
	// §7a: a natural result below a bar the combined set passes is a stop, not a pass.
	const naturalShort = Object.entries(allPass).filter(([k, v]) => v && !naturalPass[k as keyof typeof naturalPass]);
	const report = {
		attribution: ATTRIBUTION,
		negativeRecall: `Negative recall on all items is carried by planted negatives and is therefore optimistic, as v1's contradicts recall was. Natural negative recall rests on ${natural.negativeRecall.n} natural negatives.`,
		judge: [...new Set(judged.map((j) => j.model))],
		calls: judged.length,
		failedCalls: judged.filter((j) => j.status !== 200).map((j) => ({ answer: j.answer, error: j.error })),
		attributeItemsJudged: attributeRows.length,
		driftItemsJudged: driftRows.length,
		itemsTotal: items.length,
		usage: judged.reduce(
			(sum, j) => ({
				input: sum.input + (j.usage?.input_tokens ?? 0),
				output: sum.output + (j.usage?.output_tokens ?? 0),
			}),
			{ input: 0, output: 0 },
		),
		all,
		naturalOnly: natural,
		passesAll: allPass,
		passesNaturalOnly: naturalPass,
		gate: !corpusPass ? "fail" : naturalShort.length ? "stop: natural items fall short" : "pass on the corpus",
		pending: "Drift's second check, 16 of 20 live review-queue passages read by eye, happens at Checkpoint 7.",
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
