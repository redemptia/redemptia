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
import { brands, organization, promptRuns, prompts, runMentions, usageEvents } from "@workspace/lib/db/schema";
import {
	brandFacts,
	mentionJudgeCalls,
	perceptionAttributes,
	perceptionBrandSettings,
	perceptionJevCalls,
	perceptionProminenceDirty,
	perceptionPrompts,
	perceptionRollupDirty,
	perceptionRunStatus,
	perceptionVerdicts,
	rollupPerceptionDaily,
	rollupProminenceDaily,
} from "@workspace/lib/db/schema-perception";
import { DAILY_JEV_CALL_CEILING, DAILY_MENTION_JUDGE_CEILING } from "@workspace/lib/perception/limits";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { JEV_MODEL, stubTransport } from "../src/mention-judge/jev";
import { judgePendingRuns, perceptionStamp } from "../src/perception/judge-runs";
import { reserveMentionCall, splitByAllowance } from "../src/perception/mention-budget";
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
		env: { ...process.env, DATABASE_URL: url, DEPLOYMENT_MODE: "local" },
		encoding: "utf8",
	});
	return JSON.parse(out.trim().split("\n").pop() ?? "");
}

/** The readout and today's count, read through the web app's own code. */
function readoutOf(
	brandId: string,
	url: string,
	env: Record<string, string> = {},
): { facts: { answers: number }[]; ceilingReached: boolean; trackingPaused: boolean; callsToday: number } {
	const out = execFileSync("pnpm", ["exec", "tsx", "scripts/perception-readout-probe.ts", brandId], {
		cwd: WEB,
		env: { ...process.env, DATABASE_URL: url, DEPLOYMENT_MODE: "local", ...env },
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
	await reader.end();

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
}

/** The trigger on elmo's run_mentions marks market days only, and the incremental rollup consumes the markers. */
async function rehearseMarkers(db: Db, histId: string, histPrompt: string) {
	const marked = () =>
		db
			.select({ day: perceptionProminenceDirty.day })
			.from(perceptionProminenceDirty)
			.where(eq(perceptionProminenceDirty.brandId, histId));
	const marketDays = Array.from({ length: DAYS }, (_, i) => i + 1).filter((d) => perDay(d) > 0).length;
	assert.equal((await marked()).length, marketDays);

	const factRun = randomUUID();
	await db.insert(promptRuns).values({
		id: factRun,
		promptId: histPrompt,
		brandId: histId,
		model: "claude",
		provider: "openrouter",
		version: "dryrun",
		webSearchEnabled: true,
		webQueries: [],
		createdAt: at(DAYS + 6, 0),
		rawOutput: {},
	});
	await db.insert(runMentions).values({ runId: factRun, brandMentioned: true, competitorsMentioned: [] });
	await db.update(runMentions).set({ brandMentioned: false }).where(eq(runMentions.runId, factRun));
	assert.equal((await marked()).length, marketDays);
	await db.delete(promptRuns).where(eq(promptRuns.id, factRun));
	ok(
		`a mention row writes a marker for each of the ${marketDays} market-answer days, and none for a fact answer's day`,
	);

	const built = await buildProminenceRollups(db, new Date(), { fullPass: false, brandId: histId });
	assert.equal(built.days, marketDays);
	assert.equal((await marked()).length, 0);
	ok("the incremental rollup job builds exactly the marked days and clears the markers");
}

/** The skip rule and the mention judge's daily allowance, the two caps that stand between a catch-up and spend. */
async function rehearseGuards(db: Db) {
	const id = `dryrun-guards-${randomUUID()}`;
	await db.insert(organization).values({ id, name: id, slug: id, createdAt: new Date() });
	await db
		.insert(brands)
		.values({ id, organizationId: id, name: "Skip Co", website: "https://skip.example", onboarded: true });
	await db.insert(perceptionBrandSettings).values({ brandId: id, enabled: true });
	await db.insert(brandFacts).values({ brandId: id, statement: "Skip Co is open source.", validFrom: "2026-01-01" });
	const [{ id: promptId }] = await db
		.insert(prompts)
		.values({ brandId: id, value: "Is Skip Co open source?" })
		.returning({ id: prompts.id });
	await db.insert(perceptionPrompts).values({ promptId, class: "fact" });
	for (const text of ["The price of the tools is not the same in all of the shops.", "Skip Co is open source."])
		await db.insert(promptRuns).values({
			id: randomUUID(),
			promptId,
			brandId: id,
			model: "claude",
			provider: "openrouter",
			version: "dryrun",
			webSearchEnabled: true,
			rawOutput: { choices: [{ message: { content: text } }] },
			webQueries: [],
			createdAt: new Date(),
		});
	const outcome = await judgePendingRuns(db, stubTransport, "stub");
	assert.deepEqual(
		{ runs: outcome.runs, calls: outcome.calls, skipped: outcome.skipped },
		{ runs: 2, calls: 1, skipped: 1 },
	);
	const flagged = await db
		.select({ id: perceptionVerdicts.id })
		.from(perceptionVerdicts)
		.innerJoin(promptRuns, eq(promptRuns.id, perceptionVerdicts.runId))
		.where(and(eq(promptRuns.brandId, id), eq(perceptionVerdicts.skipped, true)));
	assert.equal(flagged.length, 1);
	ok("an answer that cannot name the brand is recorded as skipped without a call; the one that names it is judged");

	const paused = (env: Record<string, string>) => readoutOf(id, scratch.toString(), env).trackingPaused;
	const callEvents = (count: number) =>
		db
			.insert(usageEvents)
			.values(Array.from({ length: count }, () => ({ organizationId: id, brandId: id, eventType: "prompt_run" })));
	await callEvents(2);
	assert.equal(await paused({ DAILY_PROVIDER_CALL_CEILING: "3" }), false);
	await callEvents(1);
	assert.equal(await paused({ DAILY_PROVIDER_CALL_CEILING: "3" }), true);
	assert.equal(await paused({}), false);
	ok("at the provider call ceiling the readout says new answers have paused, and not before it");

	const allowance = [1, 2, 3].map(() => reserveMentionCall(db, id, 2));
	assert.deepEqual((await Promise.all(allowance)).sort(), [false, true, true]);
	await db
		.update(mentionJudgeCalls)
		.set({ calls: DAILY_MENTION_JUDGE_CEILING })
		.where(eq(mentionJudgeCalls.organizationId, id));
	const split = await splitByAllowance(
		db,
		id,
		[{ id: "a", stamps: {} }],
		{ mentions: "current" } as never,
		"jev-1.13.0",
	);
	assert.deepEqual(split.refused, ["a"]);
	const free = await splitByAllowance(db, id, [{ id: "a", stamps: {} }], { mentions: "current" } as never, "stub+x");
	assert.deepEqual(free.refused, []);
	ok("elmo's mention judge allowance hands out its last slots once, refuses past them, and charges the stub nothing");
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
async function seedHistory(db: Db): Promise<{ histId: string; histPrompt: string; histTotal: number }> {
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
	return { histId, histPrompt, histTotal };
}

/** Two weeks of answers on a second brand, judged twice, and the history series read back. */
async function rehearseHistory(db: Db) {
	const { histId, histPrompt, histTotal } = await seedHistory(db);
	await rehearseMarkers(db, histId, histPrompt);
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
		// Dropping the database with FORCE terminates any connection still open, which a pool reports as an error.
		(db.$client as unknown as pg.Pool).on("error", () => {});

		await rehearseJob(db);
		await rehearseHistory(db);
		await rehearseGuards(db);
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
	console.error(
		`\nFAIL  ${error instanceof Error ? (process.argv.includes("--stack") ? error.stack : error.message) : error}`,
	);
	process.exit(1);
});
