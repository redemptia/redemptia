import { randomUUID } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { brands, organization, promptRuns, prompts } from "@workspace/lib/db/schema";
import {
	brandFacts,
	perceptionPrompts,
	perceptionRollupDirty,
	perceptionVerdicts,
	rollupPerceptionDaily,
} from "@workspace/lib/db/schema-perception";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildPerceptionRollups } from "./rollup";

let brandId: string;
let promptId: string;
let factId: string;

beforeEach(async () => {
	brandId = `brand-${randomUUID()}`;
	await db.insert(organization).values({ id: brandId, name: brandId, slug: brandId, createdAt: new Date() });
	await db
		.insert(brands)
		.values({ id: brandId, organizationId: brandId, name: "Acme", website: "https://acme.example", onboarded: true });
	[{ id: promptId }] = await db
		.insert(prompts)
		.values({ brandId, value: "What does Acme cost?" })
		.returning({ id: prompts.id });
	await db.insert(perceptionPrompts).values({ promptId, class: "fact" });
	[{ id: factId }] = await db
		.insert(brandFacts)
		.values({ brandId, statement: "Acme has a free plan.", validFrom: "2026-01-01" })
		.returning({ id: brandFacts.id });
});

afterEach(async () => {
	await db.execute(sql`DROP TRIGGER IF EXISTS fail_rollup_insert ON rollup_perception_daily`);
	await db.delete(perceptionRollupDirty).where(eq(perceptionRollupDirty.brandId, brandId));
	await db.delete(rollupPerceptionDaily).where(eq(rollupPerceptionDaily.brandId, brandId));
	await db.delete(perceptionVerdicts).where(sql`run_id IN (SELECT id FROM prompt_runs WHERE brand_id = ${brandId})`);
	await db.delete(promptRuns).where(eq(promptRuns.brandId, brandId));
	await db.delete(prompts).where(eq(prompts.brandId, brandId));
	await db.delete(brandFacts).where(eq(brandFacts.brandId, brandId));
	await db.delete(brands).where(eq(brands.id, brandId));
	await db.delete(organization).where(eq(organization.id, brandId));
});

/** An answer at `at`, judged `verdict` on the fact at `stamp`; marks its UTC day dirty, as the judge does. */
async function judged(at: string, verdict: string, model = "chatgpt", stamp = "s1") {
	const id = randomUUID();
	await db.insert(promptRuns).values({
		id,
		promptId,
		brandId,
		model,
		provider: "openrouter",
		version: "test",
		webSearchEnabled: true,
		rawOutput: {},
		webQueries: [],
		createdAt: new Date(at),
	});
	await db.insert(perceptionVerdicts).values({
		runId: id,
		subject: "Acme",
		kind: "fact",
		factId,
		verdict,
		probabilities: { [verdict]: 1 },
		stamp,
	});
	await db
		.insert(perceptionRollupDirty)
		.values({ brandId, day: at.slice(0, 10) })
		.onConflictDoNothing();
	return id;
}

const rollup = async () =>
	(await db.select().from(rollupPerceptionDaily).where(eq(rollupPerceptionDaily.brandId, brandId)))
		.map((row) => `${row.day} ${row.model} ${row.verdict} ${row.stamp} ${row.answers}`)
		.sort();
const markers = async () => db.select().from(perceptionRollupDirty).where(eq(perceptionRollupDirty.brandId, brandId));

describe("building a day", () => {
	it("counts each answer once per verdict value, in UTC days, and clears the marker", async () => {
		await judged("2026-10-10T12:00:00Z", "supports");
		await judged("2026-10-10T13:00:00Z", "supports");
		await judged("2026-10-10T14:00:00Z", "absent", "claude");
		await judged("2026-10-10T23:30:00Z", "supports");
		await judged("2026-10-11T00:30:00Z", "supports");

		const outcome = await buildPerceptionRollups(db);

		expect(outcome).toEqual({ days: 2, rows: 3 });
		expect(await rollup()).toEqual([
			"2026-10-10 chatgpt supports s1 3",
			"2026-10-10 claude absent s1 1",
			"2026-10-11 chatgpt supports s1 1",
		]);
		expect(await markers()).toEqual([]);
	});

	it("keeps each judge stamp's counts apart", async () => {
		await judged("2026-10-10T12:00:00Z", "supports", "chatgpt", "old");
		await judged("2026-10-10T13:00:00Z", "supports", "chatgpt", "new");
		await buildPerceptionRollups(db);
		expect(await rollup()).toEqual(["2026-10-10 chatgpt supports new 1", "2026-10-10 chatgpt supports old 1"]);
	});
});

describe("rebuilding", () => {
	it("gives the same rollup for the same day, not a doubled one", async () => {
		await judged("2026-10-10T12:00:00Z", "supports");
		await judged("2026-10-10T14:00:00Z", "absent", "claude");
		await buildPerceptionRollups(db);
		const first = await rollup();

		await db.insert(perceptionRollupDirty).values({ brandId, day: "2026-10-10" });
		await buildPerceptionRollups(db);

		expect(await rollup()).toEqual(first);
		expect(first).toEqual(["2026-10-10 chatgpt supports s1 1", "2026-10-10 claude absent s1 1"]);
	});

	it("takes in an answer judged since, replacing the day rather than adding to it", async () => {
		await judged("2026-10-10T12:00:00Z", "supports");
		await buildPerceptionRollups(db);
		await judged("2026-10-10T15:00:00Z", "supports");
		await buildPerceptionRollups(db);
		expect(await rollup()).toEqual(["2026-10-10 chatgpt supports s1 2"]);
	});

	it("does nothing when no day is marked", async () => {
		await judged("2026-10-10T12:00:00Z", "supports");
		await buildPerceptionRollups(db);
		expect(await buildPerceptionRollups(db)).toEqual({ days: 0, rows: 0 });
		expect(await rollup()).toEqual(["2026-10-10 chatgpt supports s1 1"]);
	});
});

describe("days marked before the job existed", () => {
	it("are built like any other, however old", async () => {
		await judged("2026-08-02T09:00:00Z", "supports");
		await judged("2026-09-15T09:00:00Z", "absent");
		const stranded = await markers();
		expect(stranded).toHaveLength(2);

		const outcome = await buildPerceptionRollups(db);

		expect(outcome.days).toBe(2);
		expect(await rollup()).toEqual(["2026-08-02 chatgpt supports s1 1", "2026-09-15 chatgpt absent s1 1"]);
		expect(await markers()).toEqual([]);
	});

	it("are left for the next job past the per-job limit", async () => {
		await judged("2026-10-01T09:00:00Z", "supports");
		await judged("2026-10-02T09:00:00Z", "supports");
		await judged("2026-10-03T09:00:00Z", "supports");

		expect(await buildPerceptionRollups(db, 2)).toMatchObject({ days: 2 });
		expect((await markers()).map((m) => m.day)).toEqual(["2026-10-03"]);
		expect(await buildPerceptionRollups(db, 2)).toMatchObject({ days: 1 });
		expect(await markers()).toEqual([]);
	});
});

describe("a failed rebuild", () => {
	it("leaves the marker and the day's earlier rollup alone, and the next job builds it", async () => {
		await judged("2026-10-10T12:00:00Z", "supports");
		await buildPerceptionRollups(db);
		await judged("2026-10-10T13:00:00Z", "supports");
		await db.execute(sql`
			CREATE OR REPLACE FUNCTION fail_rollup_insert() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'rollup write refused'; END $$ LANGUAGE plpgsql`);
		await db.execute(
			sql`CREATE TRIGGER fail_rollup_insert BEFORE INSERT ON rollup_perception_daily FOR EACH ROW EXECUTE FUNCTION fail_rollup_insert()`,
		);

		await expect(buildPerceptionRollups(db)).rejects.toThrow();

		expect(await markers()).toHaveLength(1);
		expect(await rollup()).toEqual(["2026-10-10 chatgpt supports s1 1"]);

		await db.execute(sql`DROP TRIGGER fail_rollup_insert ON rollup_perception_daily`);
		await buildPerceptionRollups(db);
		expect(await rollup()).toEqual(["2026-10-10 chatgpt supports s1 2"]);
		expect(await markers()).toEqual([]);
	});
});
