#!/usr/bin/env tsx
/**
 * Rehearses the perception path end to end on a throwaway database, with the stub judge: migrate, seed
 * a brand with fact prompts, facts and a day of answers, run the job, then check the verdicts, the
 * stamps, the budget counter, the dirty-day markers, the readout, the ceiling, the re-judge count a real
 * key would trigger, and the preflight (which must change nothing). It calls no one and spends nothing.
 *
 * Never loads .env. It creates a database named redemptia_dryrun_<time>_test on the server in
 * DRYRUN_ADMIN_URL (or TEST_DATABASE_URL), and drops it afterwards; pass --keep to leave it. It
 * refuses a server that isn't on this machine unless --allow-remote is passed.
 *
 *   TEST_DATABASE_URL=postgres://localhost:5432/redemptia_test pnpm perception:dryrun [--keep] [--allow-remote]
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createDb } from "@workspace/lib/db/db";
import { brands, organization, promptRuns, prompts } from "@workspace/lib/db/schema";
import {
	brandFacts,
	perceptionBrandSettings,
	perceptionJevCalls,
	perceptionPrompts,
	perceptionRollupDirty,
	perceptionRunStatus,
	perceptionVerdicts,
	rollupPerceptionDaily,
} from "@workspace/lib/db/schema-perception";
import { DAILY_JEV_CALL_CEILING } from "@workspace/lib/perception/limits";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { JEV_MODEL, stubTransport } from "../src/mention-judge/jev";
import { judgePendingRuns, perceptionStamp } from "../src/perception/judge-runs";
import { buildPerceptionRollups } from "../src/perception/rollup";
import { firstJobCount } from "./first-job-count";

const keep = process.argv.includes("--keep");
const adminSource = process.env.DRYRUN_ADMIN_URL ?? process.env.TEST_DATABASE_URL;
if (!adminSource) {
	console.error("Set DRYRUN_ADMIN_URL or TEST_DATABASE_URL; this script never reads .env.");
	process.exit(2);
}
const admin = new URL(adminSource);
if (!["localhost", "127.0.0.1", "[::1]"].includes(admin.hostname) && !process.argv.includes("--allow-remote")) {
	console.error(
		`Refusing ${admin.hostname}: the dry run creates and drops a database. Pass --allow-remote to allow it.`,
	);
	process.exit(2);
}

const name = `redemptia_dryrun_${Date.now()}_test`;
const scratch = new URL(adminSource);
scratch.pathname = `/${name}`;
admin.pathname = "/postgres";

const steps: string[] = [];
const ok = (message: string) => {
	steps.push(message);
	console.log(`PASS  ${message}`);
};

const WEB = resolve(__dirname, "../../web");
/** The readout and today's count, read through the web app's own code. */
function readoutOf(
	brandId: string,
	url: string,
): { facts: { answers: number }[]; ceilingReached: boolean; callsToday: number } {
	const out = execFileSync("pnpm", ["exec", "tsx", "scripts/perception-readout-probe.ts", brandId], {
		cwd: WEB,
		env: { ...process.env, DATABASE_URL: url },
		encoding: "utf8",
	});
	return JSON.parse(out.trim().split("\n").pop() ?? "");
}

async function main() {
	const adminClient = new pg.Client({ connectionString: admin.toString() });
	await adminClient.connect();
	await adminClient.query(`CREATE DATABASE "${name}"`);
	console.log(`Created ${name}`);
	process.env.TYPESAFE_API_KEY = "stub";
	let client: { end(): Promise<void> } | undefined;
	let probe: pg.Client | undefined;
	try {
		const migrations = resolve(__dirname, "../../../packages/lib/src/db/migrations");
		const raw = drizzle(scratch.toString());
		await migrate(raw, { migrationsFolder: migrations });
		await raw.$client.end();
		ok("migrated a fresh database");

		const db = createDb(scratch.toString());
		client = db.$client as unknown as { end(): Promise<void> };

		const orgId = `dryrun-${randomUUID()}`;
		await db.insert(organization).values({ id: orgId, name: orgId, slug: orgId, createdAt: new Date() });
		await db
			.insert(brands)
			.values({ id: orgId, organizationId: orgId, name: "Acme", website: "https://acme.example", onboarded: true });
		await db.insert(perceptionBrandSettings).values({ brandId: orgId, enabled: true });
		const factIds: string[] = [];
		for (const statement of ["Acme's Pro plan starts at $25 per month.", "Acme can be self-hosted."]) {
			const [{ id }] = await db
				.insert(brandFacts)
				.values({ brandId: orgId, statement, validFrom: "2026-01-01" })
				.returning({ id: brandFacts.id });
			factIds.push(id);
		}
		const promptIds: string[] = [];
		for (const value of ["How much does Acme cost?", "Can Acme be self-hosted?"]) {
			const [{ id }] = await db.insert(prompts).values({ brandId: orgId, value }).returning({ id: prompts.id });
			await db.insert(perceptionPrompts).values({ promptId: id, class: "fact" });
			promptIds.push(id);
		}
		const answer = (text: string, promptId: string, model: string, daysAgo: number) =>
			db.insert(promptRuns).values({
				id: randomUUID(),
				promptId,
				brandId: orgId,
				model,
				provider: "openrouter",
				version: "dryrun",
				webSearchEnabled: true,
				rawOutput: { choices: [{ message: { content: text } }] },
				webQueries: [],
				createdAt: new Date(Date.now() - daysAgo * 86_400_000 - Math.random() * 3_600_000),
			});
		let seeded = 0;
		for (const promptId of promptIds)
			for (const model of ["chatgpt", "claude", "perplexity"])
				for (const daysAgo of [0, 1]) {
					await answer(
						"Acme starts at $25 a month and can be self-hosted on your own servers.",
						promptId,
						model,
						daysAgo,
					);
					seeded++;
				}
		ok(`seeded a brand with ${factIds.length} facts, ${promptIds.length} fact prompts and ${seeded} answers`);

		const outcome = await judgePendingRuns(db, stubTransport, "stub");
		assert.deepEqual(
			{ runs: outcome.runs, calls: outcome.calls, verdicts: outcome.verdicts, over: outcome.overCeiling },
			{ runs: seeded, calls: seeded, verdicts: seeded * factIds.length, over: false },
		);
		ok(
			`the job judged ${outcome.runs} answers in ${outcome.calls} calls (one per answer) and wrote ${outcome.verdicts} verdicts`,
		);

		const stamps = await db.selectDistinct({ stamp: perceptionVerdicts.stamp }).from(perceptionVerdicts);
		assert.deepEqual(stamps, [{ stamp: perceptionStamp("stub") }]);
		ok(`every verdict is stamped ${perceptionStamp("stub")}`);

		assert.equal(readoutOf(orgId, scratch.toString()).callsToday, seeded);
		ok(`the budget counter reads ${seeded} of ${DAILY_JEV_CALL_CEILING}`);

		const dirty = await db.select().from(perceptionRollupDirty).where(eq(perceptionRollupDirty.brandId, orgId));
		assert.equal(dirty.length, 2);
		ok("the judge marked both answer days dirty");

		const built = await buildPerceptionRollups(db);
		assert.equal(built.days, 2);
		assert.equal(
			(await db.select().from(perceptionRollupDirty).where(eq(perceptionRollupDirty.brandId, orgId))).length,
			0,
		);
		const rollupRows = () => db.select().from(rollupPerceptionDaily).where(eq(rollupPerceptionDaily.brandId, orgId));
		const rolled = await rollupRows();
		for (const factId of factIds)
			assert.equal(
				rolled.filter((row) => row.refKey === factId).reduce((sum, row) => sum + row.answers, 0),
				seeded,
			);
		ok(
			`the rollup job built ${built.rows} rows over ${built.days} days, cleared both markers, and counts ${seeded} answers per fact`,
		);

		for (const day of new Set(rolled.map((row) => row.day)))
			await db.insert(perceptionRollupDirty).values({ brandId: orgId, day });
		await buildPerceptionRollups(db);
		const sorted = (rows: typeof rolled) => JSON.stringify(rows.map((row) => JSON.stringify(row)).sort());
		assert.equal(sorted(await rollupRows()), sorted(rolled));
		ok("rebuilding the same days gives the same rollup, not a doubled one");

		assert.equal((await db.select().from(perceptionRunStatus)).length, 0);
		const readout = readoutOf(orgId, scratch.toString());
		assert.equal(readout.facts.length, factIds.length);
		for (const fact of readout.facts) assert.equal(fact.answers, seeded);
		assert.equal(readout.ceilingReached, false);
		ok(
			`the readout (still read from verdicts) reports ${readout.facts.length} facts over ${seeded} answers each, the same totals as the rollup`,
		);

		const again = await judgePendingRuns(db, stubTransport, "stub");
		assert.deepEqual({ runs: again.runs, calls: again.calls }, { runs: 0, calls: 0 });
		ok("a second job pays for nothing it already has");

		const realStamp = perceptionStamp(JEV_MODEL);
		const reader = new pg.Client({ connectionString: scratch.toString() });
		probe = reader;
		await reader.connect();
		const count = await firstJobCount(reader, realStamp);
		assert.equal(count.perception.find((row) => row.class === "fact")?.runs, seeded);
		ok(
			`switching to a real key would re-judge all ${seeded} stub-judged answers (first-job-count.sql at ${realStamp})`,
		);

		const tables = ["perception_verdicts", "perception_jev_calls", "perception_rollup_dirty", "prompt_runs"];
		const sizes = async () => {
			const counts: number[] = [];
			for (const t of tables) counts.push(Number((await reader.query(`select count(*) from ${t}`)).rows[0].count));
			return counts;
		};
		const before = await sizes();
		const preflight = execFileSync("pnpm", ["exec", "tsx", "scripts/perception-preflight.ts"], {
			cwd: resolve(__dirname, ".."),
			env: {
				...process.env,
				DATABASE_URL: scratch.toString(),
				DEPLOYMENT_MODE: "local",
				TYPESAFE_API_KEY: "apikey_dryrun_placeholder",
			},
			encoding: "utf8",
		});
		assert.match(preflight, /PASS {2}Migrations: all \d+ applied/);
		assert.match(preflight, new RegExp(`fact runs it would pick up: ${seeded} `));
		assert.deepEqual(await sizes(), before);
		ok("the preflight passes on this database and changed no rows");

		await db.insert(promptRuns).values(
			Array.from({ length: 3 }, () => ({
				id: randomUUID(),
				promptId: promptIds[0],
				brandId: orgId,
				model: "chatgpt",
				provider: "openrouter",
				version: "dryrun",
				webSearchEnabled: true,
				rawOutput: { choices: [{ message: { content: "Acme can be self-hosted." } }] },
				webQueries: [],
				createdAt: new Date(),
			})),
		);
		await db
			.update(perceptionJevCalls)
			.set({ calls: DAILY_JEV_CALL_CEILING - 1 })
			.where(eq(perceptionJevCalls.organizationId, orgId));
		const capped = await judgePendingRuns(db, stubTransport, "stub");
		assert.deepEqual({ calls: capped.calls, over: capped.overCeiling }, { calls: 1, over: true });
		const paused = readoutOf(orgId, scratch.toString());
		assert.deepEqual(
			{ calls: paused.callsToday, reached: paused.ceilingReached },
			{ calls: DAILY_JEV_CALL_CEILING, reached: true },
		);
		ok("at the ceiling the job stops after one more call, and the readout says checks have paused");
	} finally {
		await probe?.end().catch(() => {});
		await client?.end().catch(() => {});
		if (keep) console.log(`Kept ${name}`);
		else {
			await adminClient.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
			console.log(`Dropped ${name}`);
		}
		await adminClient.end();
	}
	console.log(`\nDry run passed: ${steps.length} checks, no call made, nothing spent.`);
}

main().catch((error) => {
	console.error(`\nFAIL  ${error instanceof Error ? error.message : error}`);
	process.exit(1);
});
