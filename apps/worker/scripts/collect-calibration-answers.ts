#!/usr/bin/env tsx
/**
 * Collects the real answers for a perception calibration corpus version: every prompt in
 * `inputs.json`, once per model, through the same OpenRouter provider the worker scrapes with.
 * The text is extracted with `extractRun`, as the perception job will extract it.
 *
 * Paid: one OpenRouter call (with web search) per prompt per model. Calls are sequential and
 * never retried. `capUsd` covers the whole version, answers already collected included. Spend is
 * what OpenRouter says the key has spent since the run began (its usage endpoint), or the sum of
 * the costs OpenRouter reported per answer, whichever is higher; a failed call adds only what
 * OpenRouter actually billed. Before each call the script checks that spend plus that call's
 * worst case stays within the cap.
 *
 * No judge runs and no verdict is shown, so whoever labels the answers labels them blind
 * (see PROCEDURE.md). The script refuses to run while any fact is unverified. If the version
 * already holds answers it refuses unless passed --resume, which collects only the missing ones.
 *
 * A 402 means the account can't pay for the call, so nothing was generated or billed: the run
 * stops there rather than failing every remaining call.
 *
 * Usage (reads OPENROUTER_API_KEY from the environment only; never loads .env):
 *   cd apps/worker
 *   OPENROUTER_API_KEY=... pnpm exec tsx scripts/collect-calibration-answers.ts src/perception/calibration/v1 [--resume]
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getProvider } from "@workspace/lib/providers";
import { EXTRACTOR_VERSION, extractorFor, extractRun } from "@workspace/lib/text-extraction";

// Worst-case input per call: the prompt plus whatever web results the search injects. Usage is
// measured after each call; this only bounds the pre-call check.
const WORST_CASE_INPUT_TOKENS = 30_000;
// The provider's max_tokens for OpenRouter (API_PROVIDER_MAX_OUTPUT_TOKENS), which bounds what one
// call can bill.
const MAX_OUTPUT_TOKENS = 8_000;

interface Inputs {
	provider: "openrouter";
	webSearch: boolean;
	models: { model: string; version: string }[];
	capUsd: number;
	/** `models`, when set, limits a prompt to those model labels. */
	prompts: { id: string; class: string; text: string; models?: string[] }[];
}

interface Price {
	input: number;
	output: number;
	webSearch: number;
}

const dir = process.argv[2];
const resume = process.argv.includes("--resume");
const key = process.env.OPENROUTER_API_KEY;
if (!dir) fail("Pass the corpus version directory, e.g. src/perception/calibration/v1.");
if (!key) fail("Set OPENROUTER_API_KEY in the environment.");

const inputs: Inputs = readJson(path.join(dir, "inputs.json"));
const facts: { id: string; verified_by: string | null }[] = readJson(path.join(dir, "facts.json"));
const unverified = facts.filter((fact) => !fact.verified_by).map((fact) => fact.id);
if (unverified.length > 0) fail(`Facts not yet verified: ${unverified.join(", ")}.`);
const answersPath = path.join(dir, "answers.jsonl");
const rawPath = path.join(dir, "raw.jsonl");
const existing = existsSync(answersPath)
	? readFileSync(answersPath, "utf8")
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line) as { id: string; cost_usd: number })
	: [];
const already = new Set(existing.map((answer) => answer.id));
const alreadySpent = existing.reduce((sum, answer) => sum + answer.cost_usd, 0);
if (already.size > 0 && !resume) fail(`${dir} already holds answers; pass --resume to collect only the missing ones.`);

class OutOfCredit extends Error {}

type Prompt = Inputs["prompts"][number];
type Target = Inputs["models"][number];
type Usage = { prompt_tokens?: number; completion_tokens?: number; cost?: number };

/** A call's worst case, or its measured cost when `usage` is given. */
function costOf(price: Price, usage?: Usage | null): number {
	if (usage?.cost !== undefined) return usage.cost;
	return (
		(usage?.prompt_tokens ?? WORST_CASE_INPUT_TOKENS) * price.input +
		(usage?.completion_tokens ?? MAX_OUTPUT_TOKENS) * price.output +
		(inputs.webSearch ? price.webSearch : 0)
	);
}

/** One call, never retried. Returns the cost OpenRouter reported for it, or 0 if it failed. */
async function collectOne(
	provider: ReturnType<typeof getProvider>,
	prompt: Prompt,
	target: Target,
	price: Price,
	failures: string[],
): Promise<{ cost: number; collected: boolean }> {
	const id = `${prompt.id}-${target.model}`;
	const capturedAt = new Date().toISOString();
	let result: Awaited<ReturnType<typeof provider.run>>;
	try {
		result = await provider.run(target.model, prompt.text, { version: target.version, webSearch: inputs.webSearch });
	} catch (error) {
		const message = (error instanceof Error ? error.message : String(error)).replace(
			/"user_id":"[^"]*"/g,
			'"user_id":"…"',
		);
		if (message.includes("(402)")) throw new OutOfCredit(`${id}: ${message.slice(0, 300)}`);
		// Whatever OpenRouter billed for it shows up in the key's usage.
		failures.push(`${id}: ${message.slice(0, 300)}`);
		return { cost: 0, collected: false };
	}

	const usage = (result.rawOutput as { usage?: Usage } | null)?.usage ?? null;
	const cost = costOf(price, usage ?? {});
	if (JSON.stringify(result.rawOutput).includes(key as string)) {
		fail(`${id}: the provider's response contains the API key; nothing written.`);
	}
	const { textContent, citations } = extractRun(
		result.rawOutput,
		extractorFor({ provider: inputs.provider, model: target.model }),
	);
	if (!textContent) {
		failures.push(`${id}: no text extracted`);
		return { cost, collected: false };
	}

	// Written as each answer arrives, so a crash part-way loses nothing already paid for.
	appendFileSync(
		answersPath,
		`${JSON.stringify({
			id,
			prompt_id: prompt.id,
			prompt_class: prompt.class,
			prompt: prompt.text,
			model: target.model,
			provider: inputs.provider,
			requested_version: target.version,
			model_version: result.modelVersion,
			web_search: inputs.webSearch,
			captured_at: capturedAt,
			extractor_version: EXTRACTOR_VERSION,
			origin: "natural",
			citations: citations.length,
			usage,
			cost_usd: Number(cost.toFixed(6)),
			text_sha256: createHash("sha256").update(textContent).digest("hex"),
			text: textContent,
		})}\n`,
	);
	// The generation id is tied to the account that paid for it; the rest is the answer as returned.
	const { id: _generationId, ...rawOutput } = result.rawOutput as Record<string, unknown>;
	appendFileSync(rawPath, `${JSON.stringify({ id, raw_output: rawOutput })}\n`);
	console.log(`${id}: ${textContent.length} chars, $${cost.toFixed(4)}`);
	return { cost, collected: true };
}

async function main() {
	const prices = await loadPrices(inputs.models.map((target) => target.version));
	const provider = getProvider(inputs.provider);
	const pending = inputs.prompts.flatMap((prompt) =>
		inputs.models
			.filter((target) => !prompt.models || prompt.models.includes(target.model))
			.filter((target) => !already.has(`${prompt.id}-${target.model}`))
			.map((target) => ({ prompt, target })),
	);
	const failures: string[] = [];
	const usageAtStart = await keyUsage();
	let reported = 0;
	let collected = 0;
	const spent = async () => alreadySpent + Math.max(reported, (await keyUsage()) - usageAtStart);

	for (const { prompt, target } of pending) {
		const price = prices.get(target.version) as Price;
		const sofar = await spent();
		if (sofar + costOf(price) > inputs.capUsd) {
			console.error(
				`Stopping before ${prompt.id} × ${target.version}: $${sofar.toFixed(4)} spent, cap $${inputs.capUsd}.`,
			);
			break;
		}
		try {
			const outcome = await collectOne(provider, prompt, target, price, failures);
			reported += outcome.cost;
			if (outcome.collected) collected++;
		} catch (error) {
			if (!(error instanceof OutOfCredit)) throw error;
			console.error(`Stopping: OpenRouter is out of credit. ${error.message}`);
			break;
		}
	}
	report(collected, failures, await spent());
}

/** What the key has spent in total, per OpenRouter. Only `usage` is read. */
async function keyUsage(): Promise<number> {
	const res = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` } });
	if (!res.ok) fail(`Couldn't read the key's usage from OpenRouter (${res.status}).`);
	const { data } = (await res.json()) as { data: { usage: number } };
	return data.usage;
}

function report(collected: number, failures: string[], spent: number) {
	console.log(
		`\n${collected} answers, ${failures.length} failures, $${spent.toFixed(4)} spent on this version, cap $${inputs.capUsd}.`,
	);
	for (const failure of failures) console.log(`  ${failure}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});

/** Current OpenRouter list prices, per token, for each model slug. */
async function loadPrices(versions: string[]): Promise<Map<string, Price>> {
	const res = await fetch("https://openrouter.ai/api/v1/models");
	if (!res.ok) fail(`Couldn't read OpenRouter prices (${res.status}).`);
	const { data } = (await res.json()) as {
		data: { id: string; pricing: { prompt: string; completion: string; web_search?: string } }[];
	};
	const prices = new Map<string, Price>();
	for (const version of versions) {
		const model = data.find((entry) => entry.id === version);
		if (!model) fail(`OpenRouter lists no model ${version}.`);
		prices.set(version, {
			input: Number(model.pricing.prompt),
			output: Number(model.pricing.completion),
			webSearch: Number(model.pricing.web_search ?? 0),
		});
	}
	return prices;
}

function readJson<T>(file: string): T {
	return JSON.parse(readFileSync(file, "utf8")) as T;
}

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}
