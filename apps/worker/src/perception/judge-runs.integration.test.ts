import { randomUUID } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { brands, organization, promptRuns, prompts } from "@workspace/lib/db/schema";
import {
	brandFacts,
	type PerceptionPromptClass,
	perceptionBrandSettings,
	perceptionJevCalls,
	perceptionPrompts,
	perceptionRollupDirty,
	perceptionRunStatus,
	perceptionVerdicts,
} from "@workspace/lib/db/schema-perception";
import { DAILY_JEV_CALL_CEILING } from "@workspace/lib/perception/limits";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type JevRequest, type JevResponse, RateLimited, TooLarge } from "../mention-judge/jev";
import { reserveJevCall } from "./budget";
import { judgePendingRuns, MAX_ANSWER_CHARS, perceptionStamp } from "./judge-runs";

let brandId: string;

/** The verdict questions of a request, without the evidence question asked beside each. */
const verdictKeys = (request: JevRequest) =>
	Object.keys(request.questions).filter((key) => !key.endsWith("__evidence"));

/** A judge that answers every question it is asked, and remembers each request. */
function recordingJudge(answer = "supports", fail?: (request: JevRequest) => Error | undefined, model?: string) {
	const requests: JevRequest[] = [];
	const transport = async (request: JevRequest): Promise<JevResponse> => {
		requests.push(request);
		const error = fail?.(request);
		if (error) throw error;
		return {
			...(model ? { model } : {}),
			answers: Object.fromEntries(
				Object.keys(request.questions).map((key) => [
					key,
					{ choice: answer, probabilities: { [answer]: 0.9 }, confidence: 0.8 },
				]),
			),
		};
	};
	return { requests, transport };
}

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

async function prompt(perception: PerceptionPromptClass | null = "fact") {
	const [{ id }] = await db
		.insert(prompts)
		.values({ brandId, value: "How much does Acme cost?" })
		.returning({ id: prompts.id });
	if (perception) await db.insert(perceptionPrompts).values({ promptId: id, class: perception });
	return id;
}

async function fact(statement: string, validFrom = "2026-01-01", validTo: string | null = null) {
	const [{ id }] = await db
		.insert(brandFacts)
		.values({ brandId, statement, validFrom, validTo })
		.returning({ id: brandFacts.id });
	return id;
}

async function run(promptId: string, text: string | null, createdAt = new Date()) {
	const id = randomUUID();
	await db.insert(promptRuns).values({
		id,
		promptId,
		brandId,
		model: "chatgpt",
		provider: "openrouter",
		version: "test",
		webSearchEnabled: true,
		rawOutput: text === null ? {} : { choices: [{ message: { content: text } }] },
		webQueries: [],
		createdAt,
	});
	return id;
}

const verdictsOf = (runId: string) => db.select().from(perceptionVerdicts).where(eq(perceptionVerdicts.runId, runId));
const callsToday = async () => {
	const [row] = await db
		.select({ calls: perceptionJevCalls.calls })
		.from(perceptionJevCalls)
		.where(eq(perceptionJevCalls.organizationId, brandId));
	return row?.calls ?? 0;
};

describe("finding work", () => {
	it("asks every fact valid on the run's day, in one call, and records the verdicts", async () => {
		const runId = await run(await prompt(), "Acme starts at $25 a month.");
		const pro = await fact("Acme's Pro plan starts at $25 per month.");
		const free = await fact("Acme has a free plan.");
		await fact("Acme's Pro plan starts at $20 per month.", "2025-01-01", "2025-12-31");
		const judge = recordingJudge();

		const outcome = await judgePendingRuns(db, judge.transport, "stub");

		expect(judge.requests).toHaveLength(1);
		expect(verdictKeys(judge.requests[0]).sort()).toEqual([`fact__${free}`, `fact__${pro}`].sort());
		expect(judge.requests[0].state.answer).toBe("Acme starts at $25 a month.");
		const verdicts = await verdictsOf(runId);
		expect(verdicts.map((v) => [v.factId, v.verdict, v.stamp, v.truncatedAt]).sort()).toEqual(
			[
				[free, "supports", perceptionStamp("stub"), null],
				[pro, "supports", perceptionStamp("stub"), null],
			].sort(),
		);
		expect(outcome).toMatchObject({ runs: 1, calls: 1, verdicts: 2, overCeiling: false });
		expect(await callsToday()).toBe(1);
		expect(
			await db.select().from(perceptionRollupDirty).where(eq(perceptionRollupDirty.brandId, brandId)),
		).toHaveLength(1);
	});

	it("judges nothing for a brand with perception turned off", async () => {
		await run(await prompt(), "Acme has a free plan.");
		await fact("Acme has a free plan.");
		await db
			.update(perceptionBrandSettings)
			.set({ enabled: false })
			.where(eq(perceptionBrandSettings.brandId, brandId));
		const judge = recordingJudge();

		await judgePendingRuns(db, judge.transport, "stub");

		expect(judge.requests).toHaveLength(0);
	});

	it("leaves runs of ordinary prompts, and of perception prompts that aren't fact prompts, alone", async () => {
		await fact("Acme has a free plan.");
		await run(await prompt(null), "Acme is free.");
		await run(await prompt("association"), "Acme is free.");
		await run(await prompt("market"), "Acme is free.");
		const judge = recordingJudge();

		await judgePendingRuns(db, judge.transport, "stub");

		expect(judge.requests).toHaveLength(0);
	});

	it("never pays twice for a judgement it already has, and asks a new fact on its own", async () => {
		const runId = await run(await prompt(), "Acme has a free plan.");
		await fact("Acme has a free plan.");
		await judgePendingRuns(db, recordingJudge().transport, "stub");

		const again = recordingJudge();
		await judgePendingRuns(db, again.transport, "stub");
		expect(again.requests).toHaveLength(0);

		const added = await fact("Acme can be self-hosted.");
		const third = recordingJudge();
		await judgePendingRuns(db, third.transport, "stub");
		expect(third.requests.map(verdictKeys)).toEqual([[`fact__${added}`]]);
		expect(await verdictsOf(runId)).toHaveLength(2);
	});

	it("judges again under a new stamp", async () => {
		const runId = await run(await prompt(), "Acme has a free plan.");
		await fact("Acme has a free plan.");
		await judgePendingRuns(db, recordingJudge().transport, "stub");
		const real = recordingJudge("contradicts", undefined, "jev-test");

		await judgePendingRuns(db, real.transport, "jev-test");

		expect(real.requests).toHaveLength(1);
		expect((await verdictsOf(runId)).map((v) => v.stamp).sort()).toEqual(
			[perceptionStamp("jev-test"), perceptionStamp("stub")].sort(),
		);
	});
});

describe("the judge's own fields", () => {
	it("stores each answer's confidence", async () => {
		const runId = await run(await prompt(), "Acme has a free plan.");
		await fact("Acme has a free plan.");

		await judgePendingRuns(db, recordingJudge().transport, "stub");

		expect((await verdictsOf(runId)).map((v) => v.confidence)).toEqual([expect.closeTo(0.8, 5)]);
	});

	it("treats an answer from a model other than the pinned one as a failed call", async () => {
		const runId = await run(await prompt(), "Acme has a free plan.");
		await fact("Acme has a free plan.");

		await judgePendingRuns(db, recordingJudge("supports", undefined, "jev-9.9.9").transport, "jev-1.13.0");

		expect(await verdictsOf(runId)).toHaveLength(0);
		const [status] = await db.select().from(perceptionRunStatus).where(eq(perceptionRunStatus.runId, runId));
		expect(status).toMatchObject({ outcome: null, attempts: 1 });
		expect(status.lastError).toMatch(/jev-9\.9\.9/);
	});
});

describe("what a day of answers costs in calls", () => {
	it("makes one call per answer however many facts it checks, and the count is what the ceiling bounds", async () => {
		const promptId = await prompt();
		for (const statement of ["Acme has a free plan.", "Acme can be self-hosted.", "Acme has an API."])
			await fact(statement);
		for (let i = 0; i < 6; i++) await run(promptId, "Acme has a free plan.", new Date(Date.now() - i * 1000));
		const judge = recordingJudge();

		const outcome = await judgePendingRuns(db, judge.transport, "stub");

		expect(judge.requests).toHaveLength(6);
		expect(outcome).toMatchObject({ runs: 6, calls: 6, verdicts: 18, overCeiling: false });
		expect(await callsToday()).toBe(6);
	});

	it("counts nothing on a day with no answers to judge", async () => {
		await fact("Acme has a free plan.");
		const judge = recordingJudge();

		const outcome = await judgePendingRuns(db, judge.transport, "stub");

		expect(judge.requests).toHaveLength(0);
		expect(outcome).toMatchObject({ runs: 0, calls: 0, overCeiling: false });
		expect(await callsToday()).toBe(0);
	});
});

describe("the daily call ceiling", () => {
	it("makes no call once the organization has used today's calls, and says so", async () => {
		const runId = await run(await prompt(), "Acme has a free plan.");
		await fact("Acme has a free plan.");
		await db
			.insert(perceptionJevCalls)
			.values({ organizationId: brandId, day: sql`(now() AT TIME ZONE 'UTC')::date`, calls: DAILY_JEV_CALL_CEILING });
		const judge = recordingJudge();

		const outcome = await judgePendingRuns(db, judge.transport, "stub");

		expect(judge.requests).toHaveLength(0);
		expect(outcome.overCeiling).toBe(true);
		expect(await verdictsOf(runId)).toHaveLength(0);
		expect(await callsToday()).toBe(DAILY_JEV_CALL_CEILING);
	});

	it("stops at the ceiling part-way through a job", async () => {
		const promptId = await prompt();
		await fact("Acme has a free plan.");
		for (let i = 0; i < 3; i++) await run(promptId, "Acme has a free plan.", new Date(Date.now() - i * 1000));
		await db.insert(perceptionJevCalls).values({
			organizationId: brandId,
			day: sql`(now() AT TIME ZONE 'UTC')::date`,
			calls: DAILY_JEV_CALL_CEILING - 2,
		});
		const judge = recordingJudge();

		const outcome = await judgePendingRuns(db, judge.transport, "stub");

		expect(judge.requests).toHaveLength(2);
		expect(outcome).toMatchObject({ runs: 2, overCeiling: true });
		expect(await callsToday()).toBe(DAILY_JEV_CALL_CEILING);
	});
});

describe("reserving a call", () => {
	it("grants exactly the ceiling's worth of calls to workers asking at once", async () => {
		const grants = await Promise.all(Array.from({ length: 10 }, () => reserveJevCall(db, brandId, 3)));

		expect(grants.filter(Boolean)).toHaveLength(3);
		expect(await callsToday()).toBe(3);
	});
});

describe("long answers", () => {
	it("sends at most the first 20,000 characters and records the cut", async () => {
		const text = `Acme has a free plan. ${"More detail. ".repeat(2_000)}`;
		const runId = await run(await prompt(), text);
		await fact("Acme has a free plan.");
		const judge = recordingJudge();

		await judgePendingRuns(db, judge.transport, "stub");

		expect(judge.requests[0].state.answer).toBe(text.slice(0, MAX_ANSWER_CHARS));
		expect((await verdictsOf(runId))[0].truncatedAt).toBe(MAX_ANSWER_CHARS);
	});

	it("shortens a too-large answer and asks again, with every question each time", async () => {
		const text = `Acme has a free plan. ${"More detail. ".repeat(1_000)}`;
		const runId = await run(await prompt(), text);
		const facts = [await fact("Acme has a free plan."), await fact("Acme can be self-hosted.")];
		const judge = recordingJudge("supports", (request) =>
			String(request.state.answer).length > 4_000 ? new TooLarge("too large") : undefined,
		);

		const outcome = await judgePendingRuns(db, judge.transport, "stub");

		const half = Math.floor(text.length / 2);
		const quarter = Math.floor(half / 2);
		expect(judge.requests.map((r) => String(r.state.answer).length)).toEqual([text.length, half, quarter]);
		for (const request of judge.requests) {
			expect(verdictKeys(request).sort()).toEqual(facts.map((id) => `fact__${id}`).sort());
		}
		expect(outcome.calls).toBe(3);
		expect(await callsToday()).toBe(3);
		expect((await verdictsOf(runId)).map((v) => v.truncatedAt)).toEqual([quarter, quarter]);
	});

	it("sets a run aside when even the shortest cut is too large, and doesn't try it again", async () => {
		const runId = await run(await prompt(), `Acme has a free plan. ${"More detail. ".repeat(500)}`);
		await fact("Acme has a free plan.");
		await judgePendingRuns(db, recordingJudge("supports", () => new TooLarge("too large")).transport, "stub");

		const [status] = await db.select().from(perceptionRunStatus).where(eq(perceptionRunStatus.runId, runId));
		expect(status.outcome).toBe("too_large");
		const again = recordingJudge();
		await judgePendingRuns(db, again.transport, "stub");
		expect(again.requests).toHaveLength(0);
	});
});

describe("runs that produce no verdict", () => {
	it("sets aside a run with no text without calling the judge", async () => {
		const runId = await run(await prompt(), null);
		await fact("Acme has a free plan.");
		const judge = recordingJudge();

		await judgePendingRuns(db, judge.transport, "stub");
		await judgePendingRuns(db, judge.transport, "stub");

		expect(judge.requests).toHaveLength(0);
		const [status] = await db.select().from(perceptionRunStatus).where(eq(perceptionRunStatus.runId, runId));
		expect(status.outcome).toBe("no_text");
	});

	it("gives up on a run after three failed calls, but not because of a rate limit", async () => {
		const runId = await run(await prompt(), "Acme has a free plan.");
		await fact("Acme has a free plan.");
		const limited = recordingJudge("supports", () => new RateLimited(1000, "slow down"));
		const outcome = await judgePendingRuns(db, limited.transport, "stub");
		expect(outcome.rateLimited).toBe(true);
		expect(await db.select().from(perceptionRunStatus).where(eq(perceptionRunStatus.runId, runId))).toEqual([]);

		const broken = recordingJudge("supports", () => new Error("Jev returned HTTP 500"));
		for (let i = 0; i < 4; i++) await judgePendingRuns(db, broken.transport, "stub");

		expect(broken.requests).toHaveLength(3);
		const [status] = await db.select().from(perceptionRunStatus).where(eq(perceptionRunStatus.runId, runId));
		expect(status).toMatchObject({ outcome: "failed", attempts: 3 });
	});
});

describe("the evidence passage", () => {
	/** Answers every verdict with `verdict`, and every evidence question with `pick`. */
	function evidenceJudge(verdict: string, pick: string) {
		const requests: JevRequest[] = [];
		const transport = async (request: JevRequest): Promise<JevResponse> => {
			requests.push(request);
			return {
				answers: Object.fromEntries(
					Object.keys(request.questions).map((key) =>
						key.endsWith("__evidence")
							? [key, { choice: pick, probabilities: { [pick]: 0.7 }, confidence: 0.7 }]
							: [key, { choice: verdict, probabilities: { [verdict]: 0.9 }, confidence: 0.9 }],
					),
				),
			};
		};
		return { requests, transport };
	}

	it("offers only sentences that name the brand, and stores the one picked with its own confidence", async () => {
		const id = await fact("Acme Pro costs $25 per month.");
		const runId = await run(
			await prompt(),
			"Acme Pro costs $40 a month. Globex is cheaper at $10. You can also try Acme for free.",
		);
		const judge = evidenceJudge("contradicts", "p1");

		await judgePendingRuns(db, judge.transport, "stub");

		expect(Object.values(judge.requests[0].questions[`fact__${id}__evidence`].criteria).slice(0, -1)).toEqual([
			"Acme Pro costs $40 a month.",
			"You can also try Acme for free.",
		]);
		expect(await verdictsOf(runId)).toMatchObject([
			{ verdict: "contradicts", passage: "Acme Pro costs $40 a month.", passageConfidence: 0.7, confidence: 0.9 },
		]);
	});

	it("stores no passage when the judge says none is about the fact, but keeps its confidence", async () => {
		await fact("Acme can be self-hosted.");
		const runId = await run(await prompt(), "Acme Pro costs $40 a month.");

		await judgePendingRuns(db, evidenceJudge("not_mentioned", "none").transport, "stub");

		expect(await verdictsOf(runId)).toMatchObject([
			{ verdict: "not_mentioned", passage: null, passageConfidence: 0.7 },
		]);
	});

	it("asks no evidence question when no sentence names the brand, and still records the verdict", async () => {
		const id = await fact("Acme can be self-hosted.");
		const runId = await run(await prompt(), "Most tools in this space can be self-hosted.");
		const judge = evidenceJudge("not_mentioned", "p1");

		await judgePendingRuns(db, judge.transport, "stub");

		expect(Object.keys(judge.requests[0].questions)).toEqual([`fact__${id}`]);
		expect(await verdictsOf(runId)).toMatchObject([{ passage: null, passageConfidence: null }]);
	});

	it("offers no passage from text the judge wasn't shown, when a too-large answer is shortened", async () => {
		const id = await fact("Acme can be self-hosted.");
		const filler = "Some general background on this topic. ".repeat(400);
		const runId = await run(await prompt(), `Acme can run on your servers. ${filler}Acme also has a cloud.`);
		let first = true;
		const judge = recordingJudge("supports", () => {
			if (!first) return undefined;
			first = false;
			return new TooLarge();
		});

		await judgePendingRuns(db, judge.transport, "stub");

		const offered = (request: JevRequest) => Object.values(request.questions[`fact__${id}__evidence`].criteria);
		expect(offered(judge.requests[0])).toContain("Acme also has a cloud.");
		expect(offered(judge.requests[1])).not.toContain("Acme also has a cloud.");
		expect((await verdictsOf(runId))[0].truncatedAt).not.toBeNull();
	});
});

describe("a cut answer", () => {
	it("never splits a character in two where it is cut", async () => {
		await fact("Acme can be self-hosted.");
		// An emoji straddles the 20,000-unit cut, and again each halving.
		const text = `Acme ${"\u{1f680}".repeat(MAX_ANSWER_CHARS)}`;
		await run(await prompt(), text);
		let calls = 0;
		const judge = recordingJudge("supports", () => (++calls < 3 ? new TooLarge() : undefined));

		await judgePendingRuns(db, judge.transport, "stub");

		expect(judge.requests).toHaveLength(3);
		for (const request of judge.requests) expect(/\p{Cs}/u.test(String(request.state.answer))).toBe(false);
	});
});
