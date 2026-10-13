#!/usr/bin/env tsx

/**
 * Score the sentiment analyzer against the hand-labelled golden set: per-class
 * and overall agreement, plus each call's measured tokens and cost. It calls
 * the real model (SENTIMENT_BASE_URL, Gemini by default), so it never runs in
 * CI.
 *
 * Spend is bounded by --max-cost (default $1): it stops once billed cost reaches
 * it. --dry-run prints how many calls a run would make and an upper-bound cost
 * estimate, and calls nothing.
 *
 * Usage (from apps/worker):
 *   pnpm tsx --env-file=../web/.env scripts/eval-sentiment.ts [--dry-run] [--limit N] [--max-cost 1] [--delay-ms 0] [--output result.json]
 *
 * --delay-ms paces calls, for a per-minute rate limit that would otherwise
 * reject a fast run.
 */

import { writeFileSync } from "node:fs";
import {
	buildSentimentPrompt,
	type EvalPrediction,
	loadGoldenSet,
	SENTIMENT_ANALYZER_VERSION,
	STANCES,
	scoreSentimentEval,
	sentimentAvailable,
	sentimentClassifier,
	sentimentModel,
} from "@workspace/lib/enrichment/sentiment";
import { estimateTokenCostUsd } from "@workspace/lib/usage";

/**
 * Google's published prices per million tokens, thinking billed as output.
 * Gemini's OpenAI-compatible endpoint reports tokens but no cost, so these
 * price them; the ceiling keeps its deliberately higher rate.
 */
const GEMINI_LIST_PRICE_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
	"gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
};

function flag(name: string): string | undefined {
	const i = process.argv.indexOf(name);
	return i === -1 ? undefined : process.argv[i + 1];
}

type Answer = ReturnType<typeof loadGoldenSet>[number];
type Call = { id: string; model: string; inputTokens: number; outputTokens: number; costUsd: number };

function dryRunEstimate(answers: Answer[]): number {
	// About four characters a token, and a generous allowance for the output.
	return answers.reduce(
		(sum, a) =>
			sum +
			estimateTokenCostUsd({
				inputTokens: Math.ceil(buildSentimentPrompt(a.answer, Object.keys(a.labels)).length / 4),
				outputTokens: 120 * Object.keys(a.labels).length,
			}),
		0,
	);
}

/** One answer's predictions, and its call or why it failed. */
async function judge(a: Answer): Promise<{ predictions: EvalPrediction[]; call?: Call; error?: string }> {
	const subjects = Object.keys(a.labels);
	try {
		const result = await sentimentClassifier(a.answer, subjects);
		const costUsd = result.usage.costUsd ?? estimateTokenCostUsd(result.usage);
		const byName = new Map(result.judgements.map((j) => [j.subject.trim().toLowerCase(), j.stance]));
		return {
			call: { id: a.id, model: result.model, ...result.usage, costUsd },
			predictions: subjects.map((subject) => ({
				answerId: a.id,
				subject,
				gold: a.labels[subject],
				predicted: byName.get(subject.toLowerCase()) ?? null,
			})),
		};
	} catch (error) {
		// A call that fails (a malformed reply, a rate limit) scores as missing
		// judgements rather than ending the run.
		return {
			error: error instanceof Error ? error.message.slice(0, 200) : String(error),
			predictions: subjects.map((subject) => ({ answerId: a.id, subject, gold: a.labels[subject], predicted: null })),
		};
	}
}

async function runCalls(answers: Answer[], maxCost: number, delayMs: number) {
	const predictions: EvalPrediction[] = [];
	const calls: Call[] = [];
	const failures: { id: string; error: string }[] = [];
	let spent = 0;
	for (const [i, a] of answers.entries()) {
		if (spent >= maxCost) {
			console.warn(`Stopped at --max-cost $${maxCost} after ${calls.length} calls.`);
			break;
		}
		if (delayMs > 0 && i > 0) await new Promise((r) => setTimeout(r, delayMs));
		const judged = await judge(a);
		predictions.push(...judged.predictions);
		if (judged.call) {
			calls.push(judged.call);
			spent += judged.call.costUsd;
		} else failures.push({ id: a.id, error: judged.error ?? "unknown" });
	}
	return { predictions, calls, failures, spent };
}

function printCost(calls: Call[], spent: number) {
	const perCall = (total: number) => (calls.length === 0 ? 0 : total / calls.length);
	const tokens = calls.reduce((t, c) => ({ in: t.in + c.inputTokens, out: t.out + c.outputTokens }), { in: 0, out: 0 });
	const served = new Map<string, number>();
	for (const c of calls) served.set(c.model, (served.get(c.model) ?? 0) + 1);
	const unpriced = calls.filter((c) => !GEMINI_LIST_PRICE_USD_PER_MTOK[c.model]).length;
	const listCost = calls.reduce((sum, c) => {
		const price = GEMINI_LIST_PRICE_USD_PER_MTOK[c.model];
		return price ? sum + estimateTokenCostUsd(c, price) : sum;
	}, 0);
	console.log(`\nServed by: ${[...served].map(([m, n]) => `${m} ${n}`).join(", ")}`);
	console.log(
		`Cost: $${spent.toFixed(5)} total, $${perCall(spent).toFixed(6)} per call (billed where reported, else the ceiling's rate)`,
	);
	console.log(
		`At Google list price: $${listCost.toFixed(5)} total, $${perCall(listCost).toFixed(6)} per call${unpriced ? ` (${unpriced} calls on unpriced models left out)` : ""}`,
	);
	console.log(`Tokens: ${tokens.in} in, ${tokens.out} out, ${Math.round(perCall(tokens.in))} in per call`);
}

async function main() {
	const limit = flag("--limit") ? Number(flag("--limit")) : Number.POSITIVE_INFINITY;
	const maxCost = flag("--max-cost") ? Number(flag("--max-cost")) : 1;
	const output = flag("--output");
	const delayMs = flag("--delay-ms") ? Number(flag("--delay-ms")) : 0;
	const answers = loadGoldenSet().slice(0, limit);

	if (process.argv.includes("--dry-run")) {
		console.log(
			`Dry run: ${answers.length} calls, at most about $${dryRunEstimate(answers).toFixed(4)}. Nothing was called.`,
		);
		return;
	}
	if (!sentimentAvailable({ enrichment: true })) {
		console.error("SENTIMENT_API_KEY is not set, so the analyzer can't run.");
		process.exit(2);
	}

	const { predictions, calls, failures, spent } = await runCalls(answers, maxCost, delayMs);
	const report = scoreSentimentEval(predictions);
	const pct = (v: number | null) => (v === null ? "  n/a" : `${(v * 100).toFixed(1)}%`.padStart(6));
	console.log(`\nAnalyzer v${SENTIMENT_ANALYZER_VERSION}, model ${sentimentModel()}, ${calls.length} calls`);
	console.log(
		`Overall agreement: ${pct(report.overall.agreement)} (${report.overall.correct}/${report.overall.total})`,
	);
	for (const s of STANCES) {
		const c = report.perClass[s];
		console.log(`  ${s.padEnd(20)} ${pct(c.agreement)} (${c.correct}/${c.total})`);
	}
	printCost(calls, spent);
	if (failures.length > 0) {
		console.log(`\n${failures.length} calls failed and scored as missing judgements:`);
		for (const f of failures.slice(0, 5)) console.log(`  ${f.id}: ${f.error}`);
	}
	if (output) writeFileSync(output, JSON.stringify({ report, calls, failures, predictions }, null, 2));
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
