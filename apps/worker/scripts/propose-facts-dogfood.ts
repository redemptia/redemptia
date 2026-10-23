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
import { buildProposalPrompt, discoverPages, proposeFacts, readPages } from "@workspace/lib/perception/propose-facts";
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
	const urls = await discoverPages(website);
	const pages = await readPages(urls);
	const prompt = buildProposalPrompt(brand, pages);
	const estimatedTokens = Math.ceil(prompt.length / 4);
	console.log(`Pages tried: ${urls.length}, read: ${pages.length}`);
	for (const page of pages) console.log(`  ${page.url}  ${page.text.length} chars`);
	for (const url of urls.filter((u) => !pages.some((p) => p.url === u))) console.log(`  ${url}  (nothing read)`);
	console.log(`Prompt: ${prompt.length} chars, about ${estimatedTokens} tokens.`);

	if (!values.spend) {
		writeFileSync(out, JSON.stringify({ urls, pages, prompt }, null, 2));
		console.log(`No call made. Pages and prompt written to ${out}.`);
		return;
	}

	if (!key) fail("Set OPENROUTER_API_KEY in the environment.");
	if (estimatedTokens > Number(values["max-tokens"])) fail(`Prompt is over --max-tokens; not calling.`);

	const before = await keyUsage();
	const result = await proposeFacts({
		brandName: brand,
		website,
		existingStatements: [],
		providers: [getProvider("openrouter")],
		pages,
	});
	// OpenRouter's usage figure can lag a call by a few seconds.
	await new Promise((resolve) => setTimeout(resolve, 10_000));
	const spent = (await keyUsage()) - before;

	writeFileSync(out, JSON.stringify({ ...result, spentUsd: spent }, null, 2));
	console.log(
		`Answered by ${result.answeredBy?.model ?? "nobody"}: ${result.proposals.length} kept, ${result.rejected.length} dropped, $${spent.toFixed(4)} spent.`,
	);
	for (const failure of result.failures) console.log(`  failed: ${failure.provider}: ${failure.error.slice(0, 200)}`);
}

main(brand, website, out).catch((error) => {
	console.error(error);
	process.exit(1);
});
