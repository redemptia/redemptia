#!/usr/bin/env tsx
/**
 * Runs the fact proposer once against a real brand, to judge whether what it proposes are checkable
 * claims or marketing restatements before it is wired into the product.
 *
 * Without --spend it only reads the brand's pages (no LLM call) and prints what would be sent. With
 * --spend it makes one OpenRouter call, refusing if the prompt is larger than --max-tokens, and
 * reports what the key spent, from OpenRouter's usage endpoint.
 *
 * Usage (reads OPENROUTER_API_KEY from the environment only; never loads .env):
 *   tsx scripts/propose-facts-dogfood.ts --brand Supabase --website supabase.com --out <file> [--spend]
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { buildProposalPrompt, discoverPages, proposeFacts } from "@workspace/lib/perception/propose-facts";
import { getProvider } from "@workspace/lib/providers";

const { values } = parseArgs({
	options: {
		brand: { type: "string" },
		website: { type: "string" },
		out: { type: "string" },
		spend: { type: "boolean", default: false },
		"max-tokens": { type: "string", default: "60000" },
	},
});

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

const { brand, website, out } = values;
if (!brand || !website || !out) fail("Pass --brand, --website and --out.");
const key = process.env.OPENROUTER_API_KEY;

async function keyUsage(): Promise<number> {
	const res = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` } });
	if (!res.ok) fail(`Couldn't read the key's usage from OpenRouter (${res.status}).`);
	const { data } = (await res.json()) as { data: { usage: number } };
	return data.usage;
}

async function main(brand: string, website: string, out: string) {
	const discovered = await discoverPages(website);
	const prompt = buildProposalPrompt(brand, discovered.pages);
	const estimatedTokens = Math.ceil(prompt.length / 4);
	console.log("Targets:");
	for (const entry of discovered.coverage) {
		console.log(`  ${entry.target.padEnd(12)} ${entry.url ? `${entry.url} (${entry.how})` : "NOT FOUND"}`);
	}
	console.log("Pages read:");
	for (const page of discovered.pages)
		console.log(`  ${page.target.padEnd(12)} ${page.url}  ${page.text.length} chars`);
	console.log(`Prompt: ${prompt.length} chars, about ${estimatedTokens} tokens.`);

	if (!values.spend) {
		writeFileSync(out, JSON.stringify({ ...discovered, prompt }, null, 2));
		console.log(`No call made. Pages and prompt written to ${out}.`);
		return;
	}

	if (!key) fail("Set OPENROUTER_API_KEY in the environment.");
	if (estimatedTokens > Number(values["max-tokens"])) fail("Prompt is over --max-tokens; not calling.");

	const before = await keyUsage();
	console.log(`Key usage before: $${before.toFixed(6)}`);
	const result = await proposeFacts({
		brandName: brand,
		website,
		existingStatements: [],
		providers: [getProvider("openrouter")],
		discovered,
	});
	// OpenRouter's usage figure lags a call; wait up to a minute for it to move.
	let after = before;
	for (let i = 0; i < 12 && after === before; i++) {
		await new Promise((resolve) => setTimeout(resolve, 5_000));
		after = await keyUsage();
	}
	console.log(`Key usage after:  $${after.toFixed(6)}${after === before ? " (unchanged after 60 s)" : ""}`);
	const spent = after - before;

	writeFileSync(out, JSON.stringify({ ...result, spentUsd: spent, usageBefore: before, usageAfter: after }, null, 2));
	console.log(
		`Answered by ${result.answeredBy?.model ?? "nobody"}: ${result.proposals.length} shown, ${result.heldBack.length} held back, ${result.rejected.length} dropped, $${spent.toFixed(4)} spent.`,
	);
	for (const failure of result.failures) console.log(`  failed: ${failure.provider}: ${failure.error.slice(0, 200)}`);
}

main(brand, website, out).catch((error) => {
	console.error(error);
	process.exit(1);
});
