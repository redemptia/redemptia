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
import { brands, organization, promptRuns, prompts, runMentions } from "@workspace/lib/db/schema";
import {
	brandFacts,
	perceptionAttributes,
	perceptionBrandSettings,
	perceptionJevCalls,
	perceptionPrompts,
	perceptionRollupDirty,
	perceptionRunStatus,
	perceptionVerdicts,
	rollupPerceptionDaily,
	rollupProminenceDaily,
} from "@workspace/lib/db/schema-perception";
import { DAILY_JEV_CALL_CEILING } from "@workspace/lib/perception/limits";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { JEV_MODEL, stubTransport } from "../src/mention-judge/jev";
import { judgePendingRuns, perceptionStamp } from "../src/perception/judge-runs";
import { buildPerceptionRollups } from "../src/perception/rollup";
import { buildProminenceRollups } from "../src/perception/rollup-prominence";
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
interface HistoryProbe {
	history: {
		facts: {
			days: { day: string; answers: number; stamp: string; otherStampAnswers: number }[];
			versionChanges: string[];
		}[];
	};
	factLine: { days: string[]; values: (number | null)[]; hiddenDays: number } | null;
	marketLine: { days: string[]; values: (number | null)[]; hiddenDays: number };
}
function historyOf(brandId: string, url: string): HistoryProbe {
	const out = execFileSync("pnpm", ["exec", "tsx", "scripts/perception-readout-probe.ts", brandId, "history"], {
		cwd: WEB,
		env: { ...process.env, DATABASE_URL: url },
		encoding: "utf8",
	});
	return JSON.parse(out.trim().split("\n").pop() ?? "");
}

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

type Db = ReturnType<typeof createDb>;

/** The job, its stamps, budget, rollups, readout, re-judge count, preflight and ceiling, on one brand. */
async function rehearseJob(db: Db) {
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
	reader.on("error", () => {});
	await reader.connect();
	const count = await firstJobCount(reader, realStamp);
	assert.equal(count.perception.find((row) => row.class === "fact")?.runs, seeded);
	ok(`switching to a real key would re-judge all ${seeded} stub-judged answers (first-job-count.sql at ${realStamp})`);

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

	// A new UTC day for the first brand: its budget clears and its leftover answers are judged, because
	// an organization at its ceiling stops the job for every organization until then.
	await db.update(perceptionJevCalls).set({ calls: 0 }).where(eq(perceptionJevCalls.organizationId, orgId));
	for (;;) if ((await judgePendingRuns(db, stubTransport, "stub")).runs === 0) break;

	await db.update(perceptionBrandSettings).set({ enabled: false }).where(eq(perceptionBrandSettings.brandId, orgId));
}

const DAYS = 14;
const GAP = [5, 6];
const THIN = 9;
const perDay = (daysAgo: number) => (GAP.includes(daysAgo) ? 0 : daysAgo === THIN ? 4 : 12);
const at = (daysAgo: number, i: number) =>
	new Date(
		`${new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10)}T${String(8 + (i % 12)).padStart(2, "0")}:00:00Z`,
	);

interface HistoryIds {
	histId: string;
	histPrompt: string;
	marketPrompt: string;
}

/** One fact answer and one market answer, with the mentions the market answer was judged to have. */
async function seedAnswer(db: Db, { histId, histPrompt, marketPrompt }: HistoryIds, daysAgo: number, i: number) {
	const base = {
		brandId: histId,
		model: i % 2 ? "chatgpt" : "claude",
		provider: "openrouter",
		version: "dryrun",
		webSearchEnabled: true,
		webQueries: [],
		createdAt: at(daysAgo, i),
	};
	await db.insert(promptRuns).values({
		...base,
		id: randomUUID(),
		promptId: histPrompt,
		rawOutput: { choices: [{ message: { content: "History Co has a free plan." } }] },
	});
	const marketRun = randomUUID();
	await db.insert(promptRuns).values({ ...base, id: marketRun, promptId: marketPrompt, rawOutput: {} });
	const named = i % 3 !== 0;
	await db.insert(runMentions).values({
		runId: marketRun,
		brandMentioned: named,
		competitorsMentioned: [],
		assessments: {
			...(named ? { brand: { mentioned: true, probability: 0.9, position: (i % 3) + 1 } } : {}),
			competitors: {},
			judged: { brand: "fp", competitors: { Globex: "fp" } },
		},
	});
}

/** The second brand: a fact, a fact prompt, an attribute and its market prompt, and every answer. */
async function seedHistory(db: Db): Promise<{ histId: string; histTotal: number }> {
	const histId = `dryrun-history-${randomUUID()}`;
	await db.insert(organization).values({ id: histId, name: histId, slug: histId, createdAt: new Date() });
	await db.insert(brands).values({
		id: histId,
		organizationId: histId,
		name: "History Co",
		website: "https://history.example",
		onboarded: true,
	});
	await db.insert(perceptionBrandSettings).values({ brandId: histId, enabled: true });
	await db
		.insert(brandFacts)
		.values({ brandId: histId, statement: "History Co has a free plan.", validFrom: "2026-01-01" });
	const [{ id: histPrompt }] = await db
		.insert(prompts)
		.values({ brandId: histId, value: "Does History Co have a free plan?" })
		.returning({ id: prompts.id });
	await db.insert(perceptionPrompts).values({ promptId: histPrompt, class: "fact" });
	await db.insert(perceptionAttributes).values({
		brandId: histId,
		key: "attr_speed",
		label: "Speed",
		questionText: "How does this answer characterise {subject}'s speed?",
		marketPromptText: "Which tools are fastest?",
	});
	const [{ id: marketPrompt }] = await db
		.insert(prompts)
		.values({ brandId: histId, value: "Which tools are fastest?" })
		.returning({ id: prompts.id });
	await db.insert(perceptionPrompts).values({ promptId: marketPrompt, class: "market", attributeKey: "attr_speed" });

	let histTotal = 0;
	for (let daysAgo = 1; daysAgo <= DAYS; daysAgo++)
		for (let i = 0; i < perDay(daysAgo); i++) {
			await seedAnswer(db, { histId, histPrompt, marketPrompt }, daysAgo, i);
			histTotal++;
		}
	return { histId, histTotal };
}

/** Two weeks of answers on a second brand, judged twice, and the history series read back. */
async function rehearseHistory(db: Db) {
	const { histId, histTotal } = await seedHistory(db);
	for (;;) if ((await judgePendingRuns(db, stubTransport, "stub")).runs === 0) break;
	// What a real key does: the same questions answered under the pinned model, stamped as its own version.
	const pinned: typeof stubTransport = async (request) => ({ ...(await stubTransport(request)), model: JEV_MODEL });
	const secondJudge = (limit: number) => judgePendingRuns(db, pinned, JEV_MODEL, limit);
	const partial = await secondJudge(5);
	assert.equal(partial.calls, 5);
	ok(
		`seeded ${histTotal} fact answers over ${DAYS} days with a gap and a thin day, judged them, and judged the newest 5 again under a second version`,
	);

	const factRollup = await buildPerceptionRollups(db, 200);
	const marketRollup = await buildProminenceRollups(db, new Date(), { fullPass: true });
	const activeDays = Array.from({ length: DAYS }, (_, i) => i + 1).filter((d) => perDay(d) > 0).length;
	assert.equal(marketRollup.days, activeDays);
	assert.ok(factRollup.days >= activeDays);
	ok(
		`the job built the fact rollup (${factRollup.days} days) and the prominence rollup (${marketRollup.rows} rows over ${marketRollup.days} days)`,
	);

	let history = historyOf(histId, scratch.toString());
	let days = history.history.facts[0].days;
	assert.equal(days.length, activeDays);
	const latest = days[days.length - 1];
	assert.deepEqual(
		{ answers: latest.answers, stamp: latest.stamp, other: latest.otherStampAnswers },
		{ answers: perDay(1), stamp: perceptionStamp("stub"), other: 5 },
	);
	ok(
		`the partly re-judged day shows one number over its ${perDay(1)} answers, not ${perDay(1) + 5}, and says 5 were also judged under another version`,
	);

	// Calendar days from the first day with data; dates run oldest to newest, so daysAgo d is DAYS - d.
	const line = history.factLine;
	assert.ok(line);
	assert.equal(line.days.length, DAYS);
	for (let daysAgo = 1; daysAgo <= DAYS; daysAgo++) {
		const value: number | null = line.values[DAYS - daysAgo];
		if (GAP.includes(daysAgo) || daysAgo === THIN) assert.equal(value, null, `day ${daysAgo} ago has no point`);
		else assert.notEqual(value, null, `day ${daysAgo} ago has a point`);
	}
	assert.equal(line.hiddenDays, 1);
	ok(
		`the fact series spans ${DAYS} calendar days with gaps for the ${GAP.length} empty days and the thin day (fewer than 10 answers), nothing before the first day`,
	);

	assert.deepEqual(history.marketLine?.days, line.days);
	assert.equal(history.marketLine?.values.filter((v) => v !== null).length, activeDays - 1);
	ok("the prominence series has the same shape: one point per day with enough market answers, gaps elsewhere");

	for (;;) if ((await secondJudge(25)).runs === 0) break;
	await buildPerceptionRollups(db, 200);
	history = historyOf(histId, scratch.toString());
	days = history.history.facts[0].days;
	assert.ok(days.every((day) => day.stamp === perceptionStamp(JEV_MODEL)));
	assert.equal(days[days.length - 1].answers, perDay(1));
	assert.equal(days[days.length - 1].stamp, perceptionStamp(JEV_MODEL));
	assert.deepEqual(history.history.facts[0].versionChanges, []);
	ok(
		"once every answer is judged again, each day has one number again, from the new version, with the same answer counts",
	);
}

async function main() {
	const adminClient = new pg.Client({ connectionString: admin.toString() });
	await adminClient.connect();
	await adminClient.query(`CREATE DATABASE "${name}"`);
	console.log(`Created ${name}`);
	process.env.TYPESAFE_API_KEY = "stub";
	let client: { end(): Promise<void> } | undefined;
	try {
		const migrations = resolve(__dirname, "../../../packages/lib/src/db/migrations");
		const raw = drizzle(scratch.toString());
		await migrate(raw, { migrationsFolder: migrations });
		await raw.$client.end();
		ok("migrated a fresh database");

		const db = createDb(scratch.toString());
		client = db.$client as unknown as { end(): Promise<void> };

		await rehearseJob(db);
		await rehearseHistory(db);
	} finally {
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
