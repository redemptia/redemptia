import { randomUUID } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { brands, organization, promptRuns, prompts, runMentions } from "@workspace/lib/db/schema";
import {
	perceptionProminenceDirty,
	perceptionPrompts,
	rollupProminenceDaily,
} from "@workspace/lib/db/schema-perception";
import type { MentionAssessment, RunMentionAssessments } from "@workspace/lib/mentions";
import { competitorSetFingerprint } from "@workspace/lib/perception/competitor-set";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildProminenceRollups } from "./rollup-prominence";

let brandId: string;
let promptId: string;
const NOW = new Date("2026-10-31T12:00:00Z");

beforeEach(async () => {
	brandId = `brand-${randomUUID()}`;
	await db.insert(organization).values({ id: brandId, name: brandId, slug: brandId, createdAt: new Date() });
	await db
		.insert(brands)
		.values({ id: brandId, organizationId: brandId, name: "Acme", website: "https://acme.example", onboarded: true });
	[{ id: promptId }] = await db
		.insert(prompts)
		.values({ brandId, value: "Which databases are fastest?" })
		.returning({ id: prompts.id });
	await db.insert(perceptionPrompts).values({ promptId, class: "market", attributeKey: "attr_speed" });
});

afterEach(async () => {
	await db.execute(sql`DROP TRIGGER IF EXISTS remark_during_rebuild ON rollup_prominence_daily`);
	await db.delete(perceptionProminenceDirty).where(eq(perceptionProminenceDirty.brandId, brandId));
	await db.delete(rollupProminenceDaily).where(eq(rollupProminenceDaily.brandId, brandId));
	await db.delete(promptRuns).where(eq(promptRuns.brandId, brandId));
	await db.delete(prompts).where(eq(prompts.brandId, brandId));
	await db.delete(brands).where(eq(brands.id, brandId));
	await db.delete(organization).where(eq(organization.id, brandId));
});

const named = (position?: number): MentionAssessment => ({ mentioned: true, probability: 0.9, position });

/** A market answer judged against `set`, naming the brand and competitors at the positions given. */
async function answer(
	at: string,
	ranks: { brand?: number; competitors?: Record<string, number> },
	opts: { set?: string[]; model?: string } = {},
) {
	const set = opts.set ?? ["Globex", "Initech"];
	const id = randomUUID();
	await db.insert(promptRuns).values({
		id,
		promptId,
		brandId,
		model: opts.model ?? "chatgpt",
		provider: "openrouter",
		version: "test",
		webSearchEnabled: true,
		rawOutput: {},
		webQueries: [],
		createdAt: new Date(at),
	});
	const assessments: RunMentionAssessments = {
		...(ranks.brand ? { brand: named(ranks.brand) } : {}),
		competitors: Object.fromEntries(Object.entries(ranks.competitors ?? {}).map(([n, p]) => [n, named(p)])),
		judged: { brand: "fp", competitors: Object.fromEntries(set.map((n) => [n, "fp"])) },
	};
	await db.insert(runMentions).values({
		runId: id,
		brandMentioned: !!ranks.brand,
		competitorsMentioned: Object.keys(ranks.competitors ?? {}),
		assessments,
	});
}

const rows = async () =>
	(await db.select().from(rollupProminenceDaily).where(eq(rollupProminenceDaily.brandId, brandId)))
		.map((r) => ({ ...r, promptId: undefined }))
		.sort((a, b) =>
			`${a.day}${a.subjectName}${a.competitorSetFingerprint}`.localeCompare(
				`${b.day}${b.subjectName}${b.competitorSetFingerprint}`,
			),
		);

describe("building a day of market answers", () => {
	it("stores counts per subject, so mention share, position and prominence all recompute", async () => {
		await answer("2026-10-30T10:00:00Z", { brand: 1, competitors: { Globex: 2 } });
		await answer("2026-10-30T11:00:00Z", { brand: 2, competitors: { Globex: 1 } });
		await answer("2026-10-30T12:00:00Z", { competitors: { Initech: 1 } });

		const outcome = await buildProminenceRollups(db, NOW, { fullPass: true });

		expect(outcome).toEqual({ days: 1, rows: 3 });
		const byName = Object.fromEntries((await rows()).map((r) => [r.subjectName, r]));
		expect(byName.Acme).toMatchObject({
			attributeKey: "attr_speed",
			answers: 3,
			mentionedAnswers: 2,
			positionedAnswers: 2,
			positionSum: 3,
			inversePositionSum: 1.5,
		});
		expect(byName.Globex).toMatchObject({ answers: 3, mentionedAnswers: 2, positionSum: 3, inversePositionSum: 1.5 });
		expect(byName.Initech).toMatchObject({ answers: 3, mentionedAnswers: 1, inversePositionSum: 1 });
	});

	it("keeps answers judged under different competitor sets apart", async () => {
		await answer("2026-10-30T10:00:00Z", { brand: 1 }, { set: ["Globex"] });
		await answer("2026-10-30T11:00:00Z", { brand: 3 }, { set: ["Globex", "Initech"] });

		await buildProminenceRollups(db, NOW, { fullPass: true });

		const acme = (await rows()).filter((r) => r.subjectName === "Acme");
		expect(acme.map((r) => [r.competitorSetFingerprint, r.answers, r.positionSum]).sort()).toEqual(
			[
				[competitorSetFingerprint(["Globex"]), 1, 1],
				[competitorSetFingerprint(["Globex", "Initech"]), 1, 3],
			].sort(),
		);
	});

	it("gives the same rows when the same days are rebuilt", async () => {
		await answer("2026-10-29T10:00:00Z", { brand: 1, competitors: { Globex: 2 } });
		await answer("2026-10-30T10:00:00Z", { brand: 2 }, { model: "claude" });
		await buildProminenceRollups(db, NOW, { fullPass: true });
		const first = await rows();

		await buildProminenceRollups(db, NOW, { fullPass: true });

		expect(await rows()).toEqual(first);
		expect(first.length).toBeGreaterThan(0);
	});
});

describe("which days a job rebuilds", () => {
	const markers = async () =>
		db.select().from(perceptionProminenceDirty).where(eq(perceptionProminenceDirty.brandId, brandId));

	it("marks the day of a market answer when its mentions are written, builds it, and clears the marker", async () => {
		await answer("2026-10-20T10:00:00Z", { brand: 1 });
		await answer("2026-10-21T10:00:00Z", { brand: 2 });
		expect((await markers()).map((m) => m.day).sort()).toEqual(["2026-10-20", "2026-10-21"]);

		const outcome = await buildProminenceRollups(db, NOW, { fullPass: false });

		expect(outcome.days).toBe(2);
		expect(await markers()).toEqual([]);
		expect((await rows()).filter((r) => r.subjectName === "Acme").map((r) => [r.day, r.answers])).toEqual([
			["2026-10-20", 1],
			["2026-10-21", 1],
		]);
	});

	it("builds nothing when nothing is marked, and picks up a day again when its mentions are rewritten", async () => {
		await answer("2026-10-20T10:00:00Z", { brand: 1 });
		await buildProminenceRollups(db, NOW, { fullPass: false });
		expect(await buildProminenceRollups(db, NOW, { fullPass: false })).toEqual({ days: 0, rows: 0 });

		await db
			.update(runMentions)
			.set({ brandMentioned: false })
			.where(sql`run_id IN (SELECT id FROM prompt_runs WHERE brand_id = ${brandId})`);

		expect((await markers()).map((m) => m.day)).toEqual(["2026-10-20"]);
		expect((await buildProminenceRollups(db, NOW, { fullPass: false })).days).toBe(1);
	});

	it("doesn't mark a day for the mentions of an answer to a prompt that isn't a market prompt", async () => {
		const [{ id: other }] = await db
			.insert(prompts)
			.values({ brandId, value: "An ordinary prompt" })
			.returning({ id: prompts.id });
		const runId = randomUUID();
		await db.insert(promptRuns).values({
			id: runId,
			promptId: other,
			brandId,
			model: "chatgpt",
			provider: "openrouter",
			version: "test",
			webSearchEnabled: true,
			rawOutput: {},
			webQueries: [],
			createdAt: new Date("2026-10-20T10:00:00Z"),
		});
		await db.insert(runMentions).values({ runId, brandMentioned: true, competitorsMentioned: [], assessments: null });

		expect(await markers()).toEqual([]);
	});

	it("keeps a marker written while the day was being rebuilt", async () => {
		await answer("2026-10-20T10:00:00Z", { brand: 1 });
		await db.execute(sql`
			CREATE OR REPLACE FUNCTION remark_during_rebuild() RETURNS trigger AS $$
			BEGIN UPDATE perception_prominence_dirty SET marked_at = clock_timestamp() WHERE brand_id = NEW.brand_id; RETURN NULL; END $$ LANGUAGE plpgsql`);
		await db.execute(
			sql`CREATE TRIGGER remark_during_rebuild AFTER INSERT ON rollup_prominence_daily FOR EACH ROW EXECUTE FUNCTION remark_during_rebuild()`,
		);
		try {
			await buildProminenceRollups(db, NOW, { fullPass: false });
		} finally {
			await db.execute(sql`DROP TRIGGER remark_during_rebuild ON rollup_prominence_daily`);
		}

		expect(await markers()).toHaveLength(1);
		expect((await buildProminenceRollups(db, NOW, { fullPass: false })).days).toBe(1);
		expect(await markers()).toEqual([]);
	});

	it("rebuilds every day in the window on a full pass, marked or not, and leaves answers older than the window alone", async () => {
		await answer("2026-09-10T10:00:00Z", { brand: 1 });
		await answer("2026-05-01T10:00:00Z", { brand: 1 });
		await db.delete(perceptionProminenceDirty).where(eq(perceptionProminenceDirty.brandId, brandId));

		expect(await buildProminenceRollups(db, NOW, { fullPass: false })).toEqual({ days: 0, rows: 0 });
		const full = await buildProminenceRollups(db, NOW, { fullPass: true });

		expect(full.days).toBe(1);
		expect((await rows()).map((r) => r.day)).toContain("2026-09-10");
		expect((await rows()).map((r) => r.day)).not.toContain("2026-05-01");
	});
});
