#!/usr/bin/env tsx
/**
 * Runs the attribute proposer once, warm or cold, to judge whether what it proposes is the market's
 * own vocabulary for a brand or generic category words, before it is wired into the product.
 *
 * Warm start reads its sample from a JSONL file of collected answers (one `{prompt_id, prompt, model,
 * text}` per line, as the calibration corpus stores them), through the same sampler the product uses.
 * Without --spend it prints what would be sent and makes no call. With --spend it makes one
 * OpenRouter call, refusing if the prompt is larger than --max-tokens, and reports what the key
 * spent, from OpenRouter's usage endpoint.
 *
 * Usage (reads OPENROUTER_API_KEY from the environment only; never loads .env):
 *   tsx scripts/propose-attributes-dogfood.ts --brand Supabase --category "Postgres backend-as-a-service" \
 *     --competitors Firebase,Neon --answers answers.jsonl --out <file> [--cold] [--spend]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
	buildColdPrompt,
	buildWarmPrompt,
	proposeAttributes,
	type SampleAnswer,
	selectSample,
} from "@workspace/lib/perception/propose-attributes";
import { getProvider } from "@workspace/lib/providers";

const { values } = parseArgs({
	options: {
		brand: { type: "string" },
		category: { type: "string" },
		competitors: { type: "string", default: "" },
		aliases: { type: "string", default: "" },
		answers: { type: "string" },
		"tracked-prompts": { type: "string", default: "" },
		cold: { type: "boolean", default: false },
		out: { type: "string" },
		spend: { type: "boolean", default: false },
		"max-tokens": { type: "string", default: "30000" },
	},
});

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

const { brand, out } = values;
if (!brand || !out) fail("Pass --brand and --out.");
if (!values.cold && !values.answers) fail("Pass --answers for a warm start, or --cold.");
const key = process.env.OPENROUTER_API_KEY;
const list = (value: string) =>
	value
		.split(/[,|]/)
		.map((item) => item.trim())
		.filter(Boolean);

async function keyUsage(): Promise<number> {
	const res = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` } });
	if (!res.ok) fail(`Couldn't read the key's usage from OpenRouter (${res.status}).`);
	const { data } = (await res.json()) as { data: { usage: number } };
	return data.usage;
}

function readAnswers(path: string): SampleAnswer[] {
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((line) => line.trim())
		.map((line) => JSON.parse(line) as { prompt_id: string; prompt: string; model: string; text: string })
		.map((row) => ({ promptId: row.prompt_id, prompt: row.prompt, model: row.model, text: row.text }));
}

async function main(brandName: string, out: string) {
	const context = {
		brandName,
		aliases: list(values.aliases),
		competitors: list(values.competitors),
		category: values.category ?? null,
	};
	const trackedPrompts = list(values["tracked-prompts"]);
	const sample = values.cold || !values.answers ? [] : selectSample(readAnswers(values.answers));
	const prompt = sample.length ? buildWarmPrompt(context, sample) : buildColdPrompt(context, trackedPrompts);
	const estimatedTokens = Math.ceil(prompt.length / 4);
	console.log(
		`Sample: ${sample.length} answers, ${new Set(sample.map((a) => a.promptId)).size} prompts, ${sample.reduce((s, a) => s + a.text.length, 0)} chars.`,
	);
	console.log(`Prompt: ${prompt.length} chars, about ${estimatedTokens} tokens.`);

	if (!values.spend) {
		writeFileSync(out, JSON.stringify({ context, sample, prompt }, null, 2));
		console.log(`No call made. Sample and prompt written to ${out}.`);
		return;
	}

	if (!key) fail("Set OPENROUTER_API_KEY in the environment.");
	if (estimatedTokens > Number(values["max-tokens"])) fail("Prompt is over --max-tokens; not calling.");

	const before = await keyUsage();
	const result = await proposeAttributes({
		...context,
		existingLabels: [],
		sample,
		trackedPrompts,
		providers: [getProvider("openrouter")],
	});
	// OpenRouter's usage figure lags a call; wait up to a minute for it to move.
	let after = before;
	for (let i = 0; i < 12 && after === before; i++) {
		await new Promise((resolve) => setTimeout(resolve, 5_000));
		after = await keyUsage();
	}
	const spent = after - before;
	writeFileSync(out, JSON.stringify({ ...result, spentUsd: spent, usageBefore: before, usageAfter: after }, null, 2));
	console.log(
		`${result.grounding} start, answered by ${result.answeredBy?.model ?? "nobody"}: ${result.proposals.length} shown, ${result.heldBack.length} held back, ${result.rejected.length} dropped, $${spent.toFixed(4)} spent${after === before ? " (usage unchanged after 60 s)" : ""}.`,
	);
	for (const failure of result.failures) console.log(`  failed: ${failure.provider}: ${failure.error.slice(0, 200)}`);
}

main(brand, out).catch((error) => {
	console.error(error);
	process.exit(1);
});
