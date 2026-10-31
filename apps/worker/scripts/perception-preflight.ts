#!/usr/bin/env tsx
/**
 * Read-only: whether a database and environment are ready for a real `TYPESAFE_API_KEY`, and what the
 * first real job would pick up and cost. It sets nothing and runs no job. Safe against a live database:
 * every query runs in a READ ONLY transaction with a timeout.
 *
 * Usage (never loads .env; point it at the database you mean to read):
 *   DATABASE_URL=postgres://... DEPLOYMENT_MODE=local TYPESAFE_API_KEY=... pnpm perception:preflight
 *
 * Exits 1 if any check fails; the counts are printed either way when the database answers.
 */
import { ASSOCIATION_ENABLED } from "@workspace/lib/perception/association";
import pg from "pg";
import { JEV_MODEL } from "../src/mention-judge/jev";
import { type Check, checkEnvironment, projectFirstJob } from "../src/perception/flip-checks";
import { perceptionStamp } from "../src/perception/judge-runs";
import { firstJobCount } from "./first-job-count";
import { migrationCheck } from "./migration-state";

const url = process.env.DATABASE_URL;
if (!url) {
	console.error("Set DATABASE_URL explicitly; this script never reads .env.");
	process.exit(2);
}

const usd = (value: number) => `$${value < 1 ? value.toFixed(4) : value.toFixed(2)}`;
const print = (check: Check) => console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name}: ${check.detail}`);

async function main(url: string) {
	const target = new URL(url);
	console.log(`Target: ${target.hostname}${target.port ? `:${target.port}` : ""}${target.pathname}`);
	const checks = checkEnvironment({
		mode: process.env.DEPLOYMENT_MODE,
		key: process.env.TYPESAFE_API_KEY,
		associationEnabled: ASSOCIATION_ENABLED,
	});

	const client = new pg.Client({
		connectionString: url,
		application_name: "perception-preflight",
		statement_timeout: 15_000,
	});
	try {
		await client.connect();
		await client.query("BEGIN READ ONLY");
		checks.push(await migrationCheck(client));
		for (const check of checks) print(check);

		try {
			const stamp = perceptionStamp(JEV_MODEL);
			const count = await firstJobCount(client, stamp);
			const projection = projectFirstJob(count);
			console.log(`\nFirst real job, at stamp ${stamp}:`);
			if (count.perception.length === 0) console.log("  perception runs it would pick up: 0");
			for (const row of count.perception)
				console.log(`  ${row.class} runs it would pick up: ${row.runs} (average answer ${row.avgRawChars} characters)`);
			console.log(
				`  projected Jev cost: ${usd(projection.perceptionUsd)} (per-token pricing assumed; per-question is unconfirmed)`,
			);
			console.log(
				"Elmo's judge, last 90 days (re-requested at worker start; at most 10,000 answers per organization per day):",
			);
			console.log(
				`  stub-judged runs to re-judge: ${count.stubJudgedRuns}; runs with no mention judgement: ${count.unjudgedRuns}`,
			);
			console.log(`  projected cost, upper bound: ${usd(projection.elmoUsdUpperBound)}`);
		} catch (error) {
			console.log(`\nNo count: ${error instanceof Error ? error.message : error}`);
			process.exitCode = 1;
		}
		await client.query("ROLLBACK");
	} catch (error) {
		for (const check of checks) print(check);
		console.error(`\nFAIL  Database: ${error instanceof Error ? error.message : error}`);
		process.exitCode = 1;
	} finally {
		await client.end().catch(() => {});
	}
	if (checks.some((check) => !check.ok)) process.exitCode = 1;
}

main(url).catch((error) => {
	console.error(error);
	process.exit(1);
});
