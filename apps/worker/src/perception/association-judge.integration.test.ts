import { randomUUID } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { brands, organization, promptRuns, prompts } from "@workspace/lib/db/schema";
import {
	brandFacts,
	type PerceptionPromptClass,
	perceptionAttributes,
	perceptionBrandSettings,
	perceptionJevCalls,
	perceptionPrompts,
	perceptionRollupDirty,
	perceptionVerdicts,
} from "@workspace/lib/db/schema-perception";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JevRequest, JevResponse } from "../mention-judge/jev";
import { attributeKey, DRIFT_EVIDENCE_KEY, DRIFT_KEY } from "./association-questions";
import { judgePendingRuns, LOOKBACK_DAYS } from "./judge-runs";

let brandId: string;

beforeEach(async () => {
	brandId = `brand-${randomUUID()}`;
	await db.insert(organization).values({ id: brandId, name: brandId, slug: brandId, createdAt: new Date() });
	await db
		.insert(brands)
		.values({ id: brandId, organizationId: brandId, name: "Acme", website: "https://acme.example", onboarded: true });
	await db.insert(perceptionBrandSettings).values({ brandId, enabled: true });
});

afterEach(async () => {
	await db.delete(perceptionRollupDirty).where(eq(perceptionRollupDirty.brandId, brandId));
	await db.delete(perceptionJevCalls).where(eq(perceptionJevCalls.organizationId, brandId));
	await db.delete(promptRuns).where(eq(promptRuns.brandId, brandId));
	await db.delete(prompts).where(eq(prompts.brandId, brandId));
	await db.delete(brands).where(eq(brands.id, brandId));
	await db.delete(organization).where(eq(organization.id, brandId));
});

async function prompt(perception: PerceptionPromptClass = "association", value = "What is Acme known for?") {
	const [{ id }] = await db.insert(prompts).values({ brandId, value }).returning({ id: prompts.id });
	await db.insert(perceptionPrompts).values({ promptId: id, class: perception });
	return id;
}

async function attribute(quality: string, opts: { version?: number; retired?: boolean } = {}) {
	const [{ id }] = await db
		.insert(perceptionAttributes)
		.values({
			brandId,
			key: `attr_${randomUUID()}`,
			label: quality,
			questionText: `How does this answer characterise {subject}'s ${quality}?`,
			questionVersion: opts.version ?? 1,
			marketPromptText: `Which databases are best on ${quality}?`,
			retiredAt: opts.retired ? new Date() : null,
		})
		.returning({ id: perceptionAttributes.id });
	return id;
}

async function run(promptId: string, text: string, createdAt = new Date()) {
	const id = randomUUID();
	await db.insert(promptRuns).values({
		id,
		promptId,
		brandId,
		model: "chatgpt",
		provider: "openrouter",
		version: "test",
		webSearchEnabled: true,
		rawOutput: { choices: [{ message: { content: text } }] },
		webQueries: [],
		createdAt,
	});
	return id;
}

/** A judge that answers attributes, drift and the drift passage as told, and remembers each request. */
function judge(answers: { attribute?: string; drift?: string; passage?: string } = {}) {
	const requests: JevRequest[] = [];
	const transport = async (request: JevRequest): Promise<JevResponse> => {
		requests.push(request);
		const choice = (key: string) =>
			key === DRIFT_KEY
				? (answers.drift ?? "no")
				: key === DRIFT_EVIDENCE_KEY
					? (answers.passage ?? "p1")
					: key.endsWith("__evidence")
						? "none"
						: key.startsWith("attribute__")
							? (answers.attribute ?? "positive")
							: "supports";
		return {
			answers: Object.fromEntries(
				Object.keys(request.questions).map((key) => [
					key,
					{ choice: choice(key), probabilities: { [choice(key)]: 0.9 }, confidence: 0.7 },
				]),
			),
		};
	};
	return { requests, transport };
}

const verdictsOf = (runId: string) => db.select().from(perceptionVerdicts).where(eq(perceptionVerdicts.runId, runId));

const TEXT =
	"Acme is quick to start with. Acme's pricing gets steep at scale. Acme ships with a slick admin dashboard. Globex is cheaper.";

describe("judging an association answer", () => {
	it("asks every active attribute, the drift question and the drift passage in one call, about the brand", async () => {
		const start = await attribute("ease of getting started");
		const price = await attribute("pricing and value for money", { version: 2 });
		const runId = await run(await prompt(), TEXT);
		const j = judge({ attribute: "negative" });

		const outcome = await judgePendingRuns(db, j.transport, "stub", undefined, { association: true });

		expect(j.requests).toHaveLength(1);
		const { questions } = j.requests[0];
		expect(Object.keys(questions).sort()).toEqual(
			[attributeKey(start), attributeKey(price), DRIFT_KEY, DRIFT_EVIDENCE_KEY].sort(),
		);
		expect(questions[attributeKey(start)].instructions).toMatch(
			/^How does this answer characterise Acme's ease of getting started\? Judge only what the answer says about Acme/,
		);
		expect(Object.keys(questions[attributeKey(start)].criteria)).toEqual([
			"positive",
			"negative",
			"mixed",
			"not_discussed",
		]);
		expect(questions[DRIFT_KEY].instructions).toContain("- ease of getting started\n- pricing and value for money");
		expect(Object.keys(questions[DRIFT_KEY].criteria)).toEqual(["yes", "no"]);
		// Only sentences naming the brand are offered as the drift passage.
		expect(Object.values(questions[DRIFT_EVIDENCE_KEY].criteria)).not.toContain("Globex is cheaper.");

		const verdicts = await verdictsOf(runId);
		expect(
			verdicts
				.map((v) => [v.kind, v.attributeId, v.questionVersion, v.verdict, v.passage, v.subject])
				.sort((a, b) => String(a[1]).localeCompare(String(b[1]))),
		).toEqual(
			[
				["attribute", start, 1, "negative", null, "Acme"],
				["attribute", price, 2, "negative", null, "Acme"],
				["drift", null, null, "no", null, "Acme"],
			].sort((a, b) => String(a[1]).localeCompare(String(b[1]))),
		);
		expect(outcome).toMatchObject({ runs: 1, calls: 1, verdicts: 3 });
	});

	it("keeps the drift passage only when the answer has a quality no attribute covers", async () => {
		await attribute("ease of getting started");
		const yes = await run(await prompt(), TEXT);
		await judgePendingRuns(db, judge({ drift: "yes", passage: "p3" }).transport, "stub", undefined, {
			association: true,
		});
		const [drift] = (await verdictsOf(yes)).filter((v) => v.kind === "drift");
		expect(drift).toMatchObject({ verdict: "yes", passage: "Acme ships with a slick admin dashboard." });
		expect(drift.passageConfidence).toBe(0.7);
	});

	it("judges an answer once: an attribute added later applies only to answers judged after it", async () => {
		const first = await attribute("ease of getting started");
		const promptId = await prompt();
		const earlier = await run(promptId, TEXT, new Date(Date.now() - 60_000));
		await judgePendingRuns(db, judge().transport, "stub", undefined, { association: true });

		const second = await attribute("pricing and value for money");
		const later = await run(promptId, TEXT);
		const j = judge();
		await judgePendingRuns(db, j.transport, "stub", undefined, { association: true });

		expect(j.requests).toHaveLength(1);
		expect(Object.keys(j.requests[0].questions)).toContain(attributeKey(second));
		expect((await verdictsOf(earlier)).map((v) => v.attributeId).filter(Boolean)).toEqual([first]);
		expect(
			(await verdictsOf(later))
				.map((v) => v.attributeId)
				.filter(Boolean)
				.sort(),
		).toEqual([first, second].sort());
	});

	it("leaves out retired attributes, and doesn't judge a brand with none active or with perception off", async () => {
		const active = await attribute("ease of getting started");
		const retired = await attribute("realtime", { retired: true });
		await run(await prompt(), TEXT);
		const j = judge();
		await judgePendingRuns(db, j.transport, "stub", undefined, { association: true });
		expect(Object.keys(j.requests[0].questions)).toContain(attributeKey(active));
		expect(Object.keys(j.requests[0].questions)).not.toContain(attributeKey(retired));

		await db.update(perceptionAttributes).set({ retiredAt: new Date() }).where(eq(perceptionAttributes.id, active));
		await run(await prompt(), TEXT);
		const none = judge();
		await judgePendingRuns(db, none.transport, "stub", undefined, { association: true });
		expect(none.requests).toEqual([]);

		await attribute("pricing");
		await db
			.update(perceptionBrandSettings)
			.set({ enabled: false })
			.where(eq(perceptionBrandSettings.brandId, brandId));
		const off = judge();
		await judgePendingRuns(db, off.transport, "stub", undefined, { association: true });
		expect(off.requests).toEqual([]);
	});

	it("judges no association answer while association is off", async () => {
		await attribute("ease of getting started");
		await run(await prompt(), TEXT);
		const j = judge();
		await judgePendingRuns(db, j.transport, "stub");
		expect(j.requests).toEqual([]);
	});

	it(`doesn't judge answers older than ${LOOKBACK_DAYS} days`, async () => {
		await attribute("ease of getting started");
		await run(await prompt(), TEXT, new Date(Date.now() - (LOOKBACK_DAYS + 1) * 86_400_000));
		const j = judge();
		await judgePendingRuns(db, j.transport, "stub", undefined, { association: true });
		expect(j.requests).toEqual([]);
	});

	it("asks a fact run only its facts and an association run only its attributes, in the same job", async () => {
		const attr = await attribute("ease of getting started");
		const [{ id: factId }] = await db
			.insert(brandFacts)
			.values({ brandId, statement: "Acme has a free plan.", validFrom: "2026-01-01" })
			.returning({ id: brandFacts.id });
		const factRun = await run(await prompt("fact", "Does Acme have a free plan?"), "Acme has a free plan.");
		const associationRun = await run(await prompt(), TEXT);
		const j = judge();
		await judgePendingRuns(db, j.transport, "stub", undefined, { association: true });

		expect(j.requests).toHaveLength(2);
		expect((await verdictsOf(factRun)).map((v) => [v.kind, v.factId])).toEqual([["fact", factId]]);
		expect((await verdictsOf(associationRun)).map((v) => v.kind).sort()).toEqual(["attribute", "drift"]);
		expect((await verdictsOf(associationRun)).find((v) => v.kind === "attribute")?.attributeId).toBe(attr);
	});
});
