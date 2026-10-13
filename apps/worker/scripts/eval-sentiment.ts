#!/usr/bin/env tsx

/**
 * Score the sentiment analyzer against the hand-labelled golden set: per-class
 * and overall agreement, plus each call's measured tokens and billed cost. It
 * calls the real model (OpenRouter), so it never runs in CI.
 *
 * Spend is bounded by --max-cost (default $1): it stops once billed cost reaches
 * it. --dry-run prints how many calls a run would make and an upper-bound cost
 * estimate, and calls nothing.
 *
 * Usage (from apps/worker):
 *   pnpm tsx --env-file=../web/.env scripts/eval-sentiment.ts [--dry-run] [--limit N] [--max-cost 1] [--output result.json]
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

function flag(name: string): string | undefined {
	const i = process.argv.indexOf(name);
	return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
	const dryRun = process.argv.includes("--dry-run");
	const limit = flag("--limit") ? Number(flag("--limit")) : Number.POSITIVE_INFINITY;
	const maxCost = flag("--max-cost") ? Number(flag("--max-cost")) : 1;
	const output = flag("--output");
	const answers = loadGoldenSet().slice(0, limit);

	if (dryRun) {
		// About four characters a token, and a generous allowance for the output.
		const estimate = answers.reduce(
			(sum, a) =>
				sum +
				estimateTokenCostUsd({
					inputTokens: Math.ceil(buildSentimentPrompt(a.answer, Object.keys(a.labels)).length / 4),
					outputTokens: 120 * Object.keys(a.labels).length,
				}),
			0,
		);
		console.log(`Dry run: ${answers.length} calls, at most about $${estimate.toFixed(4)}. Nothing was called.`);
		return;
	}
	if (!sentimentAvailable({ enrichment: true })) {
		console.error("OPENROUTER_API_KEY is not set, so the analyzer can't run.");
		process.exit(2);
	}

	const predictions: EvalPrediction[] = [];
	const calls: { id: string; model: string; inputTokens: number; outputTokens: number; costUsd: number }[] = [];
	let spent = 0;
	for (const a of answers) {
		if (spent >= maxCost) {
			console.warn(`Stopped at --max-cost $${maxCost} after ${calls.length} calls.`);
			break;
		}
		const subjects = Object.keys(a.labels);
		const result = await sentimentClassifier(a.answer, subjects);
		const costUsd = result.usage.costUsd ?? estimateTokenCostUsd(result.usage);
		spent += costUsd;
		calls.push({ id: a.id, model: result.model, ...result.usage, costUsd });
		const byName = new Map(result.judgements.map((j) => [j.subject.trim().toLowerCase(), j.stance]));
		for (const subject of subjects) {
			predictions.push({
				answerId: a.id,
				subject,
				gold: a.labels[subject],
				predicted: byName.get(subject.toLowerCase()) ?? null,
			});
		}
	}

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
	const served = [...new Set(calls.map((c) => c.model))].join(", ");
	const avg = calls.length === 0 ? 0 : spent / calls.length;
	const tokens = calls.reduce((t, c) => ({ in: t.in + c.inputTokens, out: t.out + c.outputTokens }), { in: 0, out: 0 });
	console.log(`\nServed by: ${served}`);
	console.log(`Cost: $${spent.toFixed(5)} total, $${avg.toFixed(6)} per call (billed by OpenRouter where reported)`);
	console.log(
		`Tokens: ${tokens.in} in, ${tokens.out} out, ${calls.length === 0 ? 0 : Math.round(tokens.in / calls.length)} in per call`,
	);
	if (output) writeFileSync(output, JSON.stringify({ report, calls, predictions }, null, 2));
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
