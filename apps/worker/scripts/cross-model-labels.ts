#!/usr/bin/env tsx
/**
 * Cross-model validation for the attribute half (PROCEDURE.md §7b): a model from a different family
 * than the AI labeller labels the same hard attribute items blind, under the same rules, and its labels
 * are sealed before anyone compares them. It sees only the rules, the answer and the item questions,
 * never another label. It prints counts and spend, never a label.
 *
 * Paid: one OpenRouter call per answer that holds a hard item.
 *
 * Usage (reads OPENROUTER_API_KEY from the environment only; never loads .env):
 *   cd apps/worker
 *   OPENROUTER_API_KEY=... pnpm exec tsx scripts/cross-model-labels.ts src/perception/calibration/v1/attributes <output.json>
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const MODEL = "google/gemini-3.8-flash";
const LABELS = ["positive", "negative", "mixed", "not_discussed"];

const [dir, out] = process.argv.slice(2);
const apiKey = process.env.OPENROUTER_API_KEY;
if (!dir || !out) fail("Pass the attribute half's directory and the output file.");
if (!apiKey) fail("Set OPENROUTER_API_KEY in the environment.");
if (existsSync(out)) fail(`${out} exists: the cross-model labels are made once.`);

const procedure = readFileSync(path.join(dir, "..", "..", "PROCEDURE.md"), "utf8");
const section = (from: string, to: string) => procedure.slice(procedure.indexOf(from), procedure.indexOf(to)).trim();
const rules = [
	section("## 5. Attribute", "## 5a."),
	"The subject rule: judge only what the answer says about Supabase; ignore claims about other companies, and sentences that name Supabase only to contrast it with something else.",
	section("## 5a.", "## 6. Item origin"),
].join("\n\n");

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

/** The hard attribute items of both parts: each sample's T-items, with their answer and question. */
const items: { id: string; answer: string; question: string }[] = [];
const texts = new Map<string, string>();
for (const suffix of ["", "-2"]) {
	const sample = new Set(
		(JSON.parse(readFileSync(path.join(dir, `validation-subset${suffix}.json`), "utf8")) as string[]).filter((id) =>
			id.startsWith("T"),
		),
	);
	const [header, ...rows] = parseCsv(readFileSync(path.join(dir, `labels-template${suffix}.csv`), "utf8"));
	const at = (name: string) => header.indexOf(name);
	for (const r of rows) {
		if (sample.has(r[at("item_id")]))
			items.push({ id: r[at("item_id")], answer: r[at("answer")], question: r[at("question")] });
	}
	for (const m of readFileSync(path.join(dir, `worksheet${suffix}.md`), "utf8").matchAll(
		/^## (A\d+)\n\n~~~~text\n([\s\S]*?)\n~~~~\n/gm,
	)) {
		texts.set(m[1], m[2]);
	}
}

async function label(answer: string, questions: { id: string; question: string }[]) {
	const prompt = `You are labelling an AI assistant's answer for a calibration corpus. Follow these rules exactly.

${rules}

For each item below, give exactly one label: positive, negative, mixed or not_discussed, judged against the item's question for Supabase only. Reply with only a JSON object mapping each item id to its label.

ITEMS:
${questions.map((q) => `${q.id}: ${q.question}`).join("\n")}

ANSWER:
${texts.get(answer)}`;
	const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
		method: "POST",
		headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
		body: JSON.stringify({
			model: MODEL,
			temperature: 0,
			response_format: { type: "json_object" },
			messages: [{ role: "user", content: prompt }],
			usage: { include: true },
		}),
	});
	if (!response.ok) throw new Error(`${answer}: OpenRouter ${response.status}`);
	const body = (await response.json()) as {
		model: string;
		choices: { message: { content: string } }[];
		usage?: { cost?: number };
	};
	const parsed = JSON.parse(body.choices[0].message.content) as Record<string, string>;
	return { model: body.model, cost: body.usage?.cost ?? 0, labels: parsed };
}

async function main() {
	const byAnswer = new Map<string, typeof items>();
	for (const item of items) byAnswer.set(item.answer, [...(byAnswer.get(item.answer) ?? []), item]);
	const labels: Record<string, string> = {};
	const models = new Set<string>();
	let cost = 0;
	for (const [answer, questions] of byAnswer) {
		const result = await label(answer, questions);
		models.add(result.model);
		cost += result.cost;
		for (const q of questions) {
			const value = result.labels[q.id];
			if (!LABELS.includes(value)) fail(`${answer}: no valid label for ${q.id}`);
			labels[q.id] = value;
		}
	}
	writeFileSync(out, `${JSON.stringify({ model: [...models], labels }, null, "\t")}\n`);
	const counts = Object.fromEntries(LABELS.map((l) => [l, Object.values(labels).filter((v) => v === l).length]));
	console.log(`${items.length} items over ${byAnswer.size} answers by ${[...models].join(", ")}; $${cost.toFixed(4)}`);
	console.log(JSON.stringify(counts));
}

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

main().catch((error) => {
	console.error(String(error).slice(0, 300));
	process.exit(1);
});
