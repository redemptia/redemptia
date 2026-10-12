#!/usr/bin/env tsx

/**
 * Prove the mention pipeline end to end on a local database: backfill, read,
 * a subject edit, and the worker's recompute, printing coverage at each step.
 * Re-run it after any change to that pipeline and compare the output.
 *
 * It needs no provider and spends nothing: it writes its own runs and answer
 * text instead of scraping. It creates a throwaway brand in its own
 * organization, reads it through the same core the Mentions page, REST and MCP
 * use, and deletes it at the end. The recompute step needs the worker running
 * against the same database (`pnpm -C apps/worker dev`); without one it waits,
 * then says so.
 *
 * Usage (from apps/web):
 *   pnpm prove:mention-pipeline [--runs 200] [--wait-seconds 300]
 */

import { randomUUID } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { brands, promptRuns, prompts } from "@workspace/lib/db/schema";
import { reconcileRunAnalyses } from "@workspace/lib/enrichment/reconcile";
import { insertRunText } from "@workspace/lib/run-texts";
import { eq, sql } from "drizzle-orm";
import { getBoss } from "@/lib/boss-client";
import { enqueueMentionRecompute } from "@/lib/job-scheduler";
import { type BrandMentionProminence, getBrandMentionProminence } from "@/server/analytics-core";
import { setBrandCompetitors } from "@/server/competitors-core";

const ANSWERS = [
	"For small teams, Northwind is the usual pick, ahead of Contoso.",
	"Contoso and Fabrikam both compete with Northwind on price.",
	"Fabrikam is popular with agencies; Initrode is newer.",
	"Most reviewers start with Northwind, then compare Initrode and Contoso.",
	"There is no clear leader; it depends on your workflow.",
];

function argument(flag: string, fallback: number): number {
	const i = process.argv.indexOf(flag);
	if (i === -1) return fallback;
	const value = Number(process.argv[i + 1]);
	if (!Number.isInteger(value) || value < 1) {
		console.error(`${flag} needs a positive integer`);
		process.exit(2);
	}
	return value;
}

/** It writes and deletes rows, so only ever against a database on this machine. */
function assertLocalDatabase() {
	const url = process.env.DATABASE_URL;
	const host = url ? new URL(url).hostname : null;
	if (host !== "localhost" && host !== "127.0.0.1") {
		console.error(
			`Refusing to run against ${host ?? "an unset DATABASE_URL"}: this script only runs on a local database.`,
		);
		process.exit(2);
	}
}

function report(step: string, result: BrandMentionProminence) {
	const { runs, analysed } = result.coverage;
	console.log(
		`\n${step}: ${analysed} of ${runs} runs analysed (${runs === 0 ? 0 : Math.round((analysed / runs) * 100)}%)`,
	);
	for (const s of result.subjects) {
		const rate = s.mentionRate === null ? "—" : `${Math.round(s.mentionRate * 100)}%`;
		const prominence = s.averageProminence === null ? "—" : s.averageProminence.toFixed(2);
		const rank = s.averageRank === null ? "—" : s.averageRank.toFixed(1);
		console.log(
			`  ${s.name.padEnd(10)} mentioned in ${String(s.mentionedRuns).padStart(4)}  rate ${rate.padStart(4)}  prominence ${prominence.padStart(4)}  rank ${rank}`,
		);
	}
}

async function main() {
	assertLocalDatabase();
	const runCount = argument("--runs", 200);
	const waitSeconds = argument("--wait-seconds", 300);

	const brandId = `proof-${randomUUID()}`;
	const window = {
		from: new Date(Date.now() - 2 * 86_400_000).toISOString(),
		to: new Date(Date.now() + 60_000).toISOString(),
		timezone: "UTC",
	};
	const read = () => getBrandMentionProminence(brandId, window);

	// Raw SQL: tsx's ESM loader doesn't resolve schema.ts's re-export of the auth tables.
	await db.execute(
		sql`INSERT INTO organization (id, name, slug, created_at) VALUES (${brandId}, ${brandId}, ${brandId}, now())`,
	);
	try {
		await db.insert(brands).values({
			id: brandId,
			organizationId: brandId,
			name: "Northwind",
			website: "https://northwind.example.com",
			onboarded: true,
			// A disabled brand is never scheduled, so a running worker can't scrape
			// runs into the proof; its enabled prompt is still in analytics scope.
			enabled: false,
		});
		await setBrandCompetitors(brandId, [
			{ name: "Contoso", domains: ["contoso.example.com"], aliases: [] },
			{ name: "Fabrikam", domains: ["fabrikam.example.com"], aliases: [] },
		]);
		const [prompt] = await db
			.insert(prompts)
			.values({ brandId, value: "best project tracking tools", enabled: true })
			.returning({ id: prompts.id });
		const start = Date.now() - 86_400_000;
		for (let i = 0; i < runCount; i++) {
			const [run] = await db
				.insert(promptRuns)
				.values({
					promptId: prompt.id,
					brandId,
					model: "chatgpt",
					version: "proof",
					webSearchEnabled: false,
					rawOutput: {},
					brandMentioned: false,
					createdAt: new Date(start + i * 1000),
				})
				.returning({ id: promptRuns.id });
			await insertRunText(db, run.id, ANSWERS[i % ANSWERS.length]);
		}
		console.log(`Seeded brand ${brandId} with ${runCount} runs and their answer text.`);

		report("1. Before backfill", await read());

		await reconcileRunAnalyses({ brandId, batchSize: 100, pauseMs: 0, dryRun: false });
		report("2. After backfill", await read());

		// The same write and enqueue the competitors settings page makes.
		await setBrandCompetitors(brandId, [
			{ name: "Contoso", domains: ["contoso.example.com"], aliases: [] },
			{ name: "Fabrikam", domains: ["fabrikam.example.com"], aliases: [] },
			{ name: "Initrode", domains: ["initrode.example.com"], aliases: [] },
		]);
		await enqueueMentionRecompute(brandId);
		report("3. After adding Initrode as a competitor", await read());

		const deadline = Date.now() + waitSeconds * 1000;
		const waitStart = Date.now();
		let latest = await read();
		while (latest.coverage.analysed < latest.coverage.runs && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 2000));
			latest = await read();
		}
		const seconds = Math.round((Date.now() - waitStart) / 1000);
		if (latest.coverage.analysed < latest.coverage.runs) {
			report(`4. Recompute not finished after ${seconds}s — is the worker running against this database?`, latest);
			process.exitCode = 1;
		} else {
			report(`4. After the worker's recompute (${seconds}s)`, latest);
		}
	} finally {
		await db.delete(promptRuns).where(eq(promptRuns.brandId, brandId));
		await db.delete(prompts).where(eq(prompts.brandId, brandId));
		await setBrandCompetitors(brandId, []).catch(() => {});
		await db.delete(brands).where(eq(brands.id, brandId));
		await db.execute(sql`DELETE FROM organization WHERE id = ${brandId}`);
		console.log(`\nDeleted ${brandId}.`);
		// The enqueue opened a pg-boss client, which would keep the process alive.
		await (await getBoss()).stop({ graceful: false });
		await db.$client.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
