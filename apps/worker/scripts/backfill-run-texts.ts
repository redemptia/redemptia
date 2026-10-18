#!/usr/bin/env tsx

/**
 * Write run_texts rows for prompt runs saved before the worker started writing
 * them, or by an older TEXT_EXTRACTOR_VERSION. Safe to stop and run again: it
 * picks up whatever still lacks a current row.
 *
 * A script rather than a pg-boss job: it runs once, deliberately, needs no queue
 * or retries, and as a job it would share the worker's pool with process-prompt.
 * It holds one connection at a time.
 *
 * Usage (from apps/worker, or inside the worker container):
 *   pnpm tsx --env-file=../web/.env scripts/backfill-run-texts.ts [--dry-run] [--batch-size 25] [--pause-ms 500]
 *   docker compose exec worker npx tsx scripts/backfill-run-texts.ts --dry-run
 */

import { db } from "@workspace/lib/db/db";
import { type BackfillProgress, backfillRunTexts } from "@workspace/lib/run-texts";

// Small: scraped payloads (BrightData, Olostep, Oxylabs) are whole rendered
// captures, and a batch holds all of its payloads in memory at once.
const DEFAULT_BATCH_SIZE = 25;
// Long enough that a backfill on a live deployment leaves the database mostly
// to the scraper between batches.
const DEFAULT_PAUSE_MS = 500;

function positiveInteger(flag: string, value: string | undefined, allowZero = false): number {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < (allowZero ? 0 : 1)) {
		console.error(`${flag} needs a ${allowZero ? "non-negative" : "positive"} integer, got "${value ?? ""}"`);
		process.exit(2);
	}
	return parsed;
}

function parseArgs(argv: string[]) {
	const options = { batchSize: DEFAULT_BATCH_SIZE, pauseMs: DEFAULT_PAUSE_MS, dryRun: false };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--dry-run") options.dryRun = true;
		else if (arg === "--batch-size") options.batchSize = positiveInteger(arg, argv[++i]);
		else if (arg === "--pause-ms") options.pauseMs = positiveInteger(arg, argv[++i], true);
		else {
			console.error(`Unknown argument: ${arg}`);
			process.exit(2);
		}
	}
	return options;
}

function report({ processed, sentinel, skipped, remaining }: BackfillProgress) {
	console.log(`processed ${processed}  sentinel ${sentinel}  skipped ${skipped}  remaining ${remaining}`);
}

function warnDivergent({ label, cause }: { label: string; cause: string }) {
	console.warn(
		`\nWARNING: found ${label} runs. These rows cannot be faithfully reconstructed from stored raw_output: ${cause}. ` +
			"Their backfilled text may differ from what the run was scored on, or be empty where the run had an answer. " +
			"They are written with source 'backfill'.\n",
	);
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	console.log(
		`${options.dryRun ? "Dry run: " : ""}backfilling run_texts in batches of ${options.batchSize}, ${options.pauseMs}ms apart`,
	);
	try {
		const result = await backfillRunTexts({ ...options, onProgress: report, onDivergent: warnDivergent });
		console.log(
			options.dryRun
				? `Would write ${result.remaining} rows; ${result.skipped} runs are already current. Nothing was written.`
				: `Done: ${result.processed} with text, ${result.sentinel} without (no answer), ${result.skipped} already current.`,
		);
		const divergent = Object.entries(result.divergent);
		if (divergent.length > 0) {
			console.warn("\nWARNING: rows that cannot be faithfully reconstructed (see the warnings above):");
			for (const [label, count] of divergent) console.warn(`  ${label}: ${count}`);
		}
	} finally {
		await db.$client.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
