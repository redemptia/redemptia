#!/usr/bin/env tsx

/**
 * Give every stale prompt run a current mention analysis: runs saved before the
 * worker started analysing them, runs whose live analysis failed, and runs
 * analysed by an older ANALYZER_VERSION, from text since re-extracted, or
 * against a brand's older subject set. Safe to stop and run again: it picks up
 * whatever is still stale.
 *
 * Run it after any deploy that bumps ANALYZER_VERSION, after backfill-run-texts
 * (new or re-extracted text leaves its run unanalysed), and after editing a
 * brand's name, aliases, domains or competitors.
 *
 * It reads run_texts, never raw_output, so batches are small in memory. Like
 * the run_texts backfill, it is a script so it runs once, deliberately, with
 * one connection at a time.
 *
 * Usage (from apps/worker, or inside the worker container):
 *   pnpm tsx --env-file=../web/.env scripts/backfill-run-mentions.ts [--dry-run] [--brand <id>] [--batch-size 200] [--pause-ms 200]
 *   docker compose exec worker npx tsx scripts/backfill-run-mentions.ts --dry-run
 */

import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { type ReconcileProgress, reconcileRunAnalyses } from "@workspace/lib/enrichment/reconcile";
import { eq } from "drizzle-orm";

// Answer text is a few KB per run, so a batch is well under a megabyte.
const DEFAULT_BATCH_SIZE = 200;
// Each batch holds row locks on its runs for its own short transaction; the
// pause leaves the database to the scraper in between.
const DEFAULT_PAUSE_MS = 200;

function positiveInteger(flag: string, value: string | undefined, allowZero = false): number {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < (allowZero ? 0 : 1)) {
		console.error(`${flag} needs a ${allowZero ? "non-negative" : "positive"} integer, got "${value ?? ""}"`);
		process.exit(2);
	}
	return parsed;
}

function parseArgs(argv: string[]) {
	const options: { batchSize: number; pauseMs: number; dryRun: boolean; brandId?: string } = {
		batchSize: DEFAULT_BATCH_SIZE,
		pauseMs: DEFAULT_PAUSE_MS,
		dryRun: false,
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--dry-run") options.dryRun = true;
		else if (arg === "--batch-size") options.batchSize = positiveInteger(arg, argv[++i]);
		else if (arg === "--pause-ms") options.pauseMs = positiveInteger(arg, argv[++i], true);
		else if (arg === "--brand") {
			const brandId = argv[++i];
			if (!brandId) {
				console.error("--brand needs a brand id");
				process.exit(2);
			}
			options.brandId = brandId;
		} else {
			console.error(`Unknown argument: ${arg}`);
			process.exit(2);
		}
	}
	return options;
}

function report({ analysed, remaining, awaitingText }: ReconcileProgress) {
	console.log(`analysed ${analysed}  remaining ${remaining}  awaiting run_texts ${awaitingText}`);
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	console.log(
		`${options.dryRun ? "Dry run: " : ""}reconciling mention analysis${options.brandId ? ` for ${options.brandId}` : ""} in batches of ${options.batchSize}, ${options.pauseMs}ms apart`,
	);
	try {
		if (options.brandId && !(await db.query.brands.findFirst({ where: eq(brands.id, options.brandId) }))) {
			console.error(`No brand with id ${options.brandId}`);
			process.exitCode = 2;
			return;
		}
		const result = await reconcileRunAnalyses({ ...options, onProgress: report });
		console.log(
			options.dryRun
				? `Would analyse ${result.remaining} runs. Nothing was written.`
				: `Done: ${result.analysed} runs analysed.`,
		);
		if (result.awaitingText > 0) {
			console.warn(
				`${result.awaitingText} runs have no run_texts row and were left unanalysed. Run backfill:run-texts, then this again.`,
			);
		}
	} finally {
		await db.$client.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
