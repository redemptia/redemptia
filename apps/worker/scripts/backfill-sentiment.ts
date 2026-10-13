#!/usr/bin/env tsx

/**
 * Judge the stance of every mentioned subject in recent answers that the
 * hourly sweep hasn't reached: after a SENTIMENT_ANALYZER_VERSION bump, or when
 * the analyzer is first switched on. Every call is a paid one, capped per
 * organization by the enrichment ceiling, and safe to stop and run again.
 *
 * --dry-run counts the calls a run would make and estimates their cost, calling
 * no model and writing nothing. Run it first. --cost-per-call sets the
 * estimate's per-call price, ideally the eval's measured average; without it
 * the estimate prices a long answer at the ceiling's deliberately high rate.
 *
 * Usage (from apps/worker, or inside the worker container):
 *   pnpm backfill:sentiment --dry-run [--days 30] [--brand <id>] [--cost-per-call 0.0005]
 *   docker compose exec worker npx tsx scripts/backfill-sentiment.ts --dry-run
 */

import { db } from "@workspace/lib/db/db";
import {
	backfillSentiment,
	sentimentAvailable,
	sentimentClassifier,
	sentimentModel,
} from "@workspace/lib/enrichment/sentiment";
import { enrichmentDailyCapUsd } from "@workspace/lib/usage/ceiling";

const DEFAULT_DAYS = 30;

function parseArgs(argv: string[]) {
	const options: { days: number; dryRun: boolean; brandId?: string; costPerCallUsd?: number } = {
		days: DEFAULT_DAYS,
		dryRun: false,
	};
	const value = (flag: string, raw: string | undefined) => {
		const parsed = Number(raw);
		if (!Number.isFinite(parsed) || parsed <= 0) {
			console.error(`${flag} needs a positive number, got "${raw ?? ""}"`);
			process.exit(2);
		}
		return parsed;
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--dry-run") options.dryRun = true;
		else if (arg === "--days") options.days = Math.ceil(value(arg, argv[++i]));
		else if (arg === "--cost-per-call") options.costPerCallUsd = value(arg, argv[++i]);
		else if (arg === "--brand" && argv[i + 1]) options.brandId = argv[++i];
		else {
			console.error(`Unknown or incomplete argument: ${arg}`);
			process.exit(2);
		}
	}
	return options;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (!options.dryRun && !sentimentAvailable({ enrichment: true })) {
		console.error("SENTIMENT_API_KEY is not set, so the analyzer can't run. --dry-run needs no key.");
		process.exit(2);
	}
	const capUsd = enrichmentDailyCapUsd();
	console.log(
		`${options.dryRun ? "Dry run: " : ""}sentiment backfill over the last ${options.days} days${options.brandId ? ` for ${options.brandId}` : ""}, capped at $${capUsd} per organization per day`,
	);
	try {
		const result = await backfillSentiment({
			...options,
			classify: sentimentClassifier,
			capUsd,
			model: sentimentModel(),
			onProgress: (done, total) => console.log(`batch ${done}/${total}`),
		});
		console.log(
			`${result.batches} batches, at most ${result.callsNeeded} paid calls, about $${result.estimatedCostUsd.toFixed(4)}.`,
		);
		if (options.dryRun) console.log("Nothing was called or written.");
		else {
			console.log(`Done: ${result.callsMade} paid calls.`);
			if (result.stoppedAtCeiling > 0) {
				console.warn(
					`${result.stoppedAtCeiling} batches stopped at an organization's enrichment ceiling; run again after it resets.`,
				);
			}
		}
	} finally {
		await db.$client.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
