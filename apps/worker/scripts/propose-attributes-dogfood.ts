#!/usr/bin/env tsx
/**
 * Runs the attribute proposer once, warm or cold, to judge whether what it proposes is the market's
 * own vocabulary for a brand or generic category words, before it is wired into the product.
 *
 * Warm start reads its sample from a JSONL file of collected answers (one `{prompt_id, prompt_class,
 * prompt, model, text}` per line, as the calibration corpus stores them), through the same sampler
 * the product uses, which leaves out fact prompts. Without --spend it prints what would be sent and
 * makes no call. With --spend it makes one OpenRouter call, refusing if the prompt is larger than
 * --max-tokens. It records no spend: the key's usage can't be attributed to one call when others run
 * at the same time, so measure a batch from the key's usage before and after it.
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

function readAnswers(path: string): SampleAnswer[] {
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((line) => line.trim())
		.map(
			(line) =>
				JSON.parse(line) as { prompt_id: string; prompt_class?: string; prompt: string; model: string; text: string },
		)
		.map((row) => ({
			promptId: row.prompt_id,
			prompt: row.prompt,
			promptClass: row.prompt_class ?? null,
			model: row.model,
			text: row.text,
		}));
}

async function main(brandName: string, out: string) {
	const context = {
		brandName,
		aliases: list(values.aliases),
		competitors: list(values.competitors),
		category: values.category ?? null,
	};
	const trackedPrompts = list(values["tracked-prompts"]);
	const candidates = values.cold || !values.answers ? [] : readAnswers(values.answers);
	const sample = selectSample(candidates);
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

	const result = await proposeAttributes({
		...context,
		existingLabels: [],
		sample: candidates,
		trackedPrompts,
		providers: [getProvider("openrouter")],
	});
	writeFileSync(out, JSON.stringify(result, null, 2));
	console.log(
		`${result.grounding} start, answered by ${result.answeredBy?.model ?? "nobody"}: ${result.proposals.length} shown, ${result.heldBack.length} held back, ${result.rejected.length} dropped.`,
	);
	for (const failure of result.failures) console.log(`  failed: ${failure.provider}: ${failure.error.slice(0, 200)}`);
}

main(brand, out).catch((error) => {
	console.error(error);
	process.exit(1);
});
