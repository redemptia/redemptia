import { db } from "@workspace/lib/db/db";
import { brandFacts, perceptionVerdicts } from "@workspace/lib/db/schema-perception";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_ACTIVE_FACTS } from "@/lib/fact-statement";
import {
	addDays,
	addFact,
	deleteFact,
	FactRuleError,
	isPerceptionEnabled,
	listFacts,
	recordFactChange,
	retireFact,
	setPerceptionEnabled,
} from "@/server/perception-facts-core";
import { createBrand, createPrompt, createRun, deleteBrand } from "@/test/integration/stats-fixtures";

const TODAY = "2026-10-23";
let brandId: string;

beforeEach(async () => {
	brandId = await createBrand({ name: "Acme" });
});

afterEach(async () => {
	await deleteBrand(brandId);
});

const add = (statement: string, validFrom = "2026-01-01", brand = brandId) =>
	addFact(db, brand, { statement, validFrom }, TODAY);

async function rejection(work: Promise<unknown>): Promise<string> {
	try {
		await work;
	} catch (error) {
		return error instanceof FactRuleError
			? error.message
			: `not a rule: ${String((error as { cause?: unknown }).cause ?? error)}`;
	}
	return "accepted";
}

async function judge(factId: string) {
	const prompt = await createPrompt(brandId);
	const run = await createRun(brandId, prompt, { at: "2026-03-01T10:00:00Z", brandMentioned: true });
	await db.insert(perceptionVerdicts).values({
		runId: run.id,
		subject: "Acme",
		kind: "fact",
		factId,
		verdict: "supports",
		probabilities: { supports: 1 },
		stamp: "test",
	});
}

/** Every version of every fact: no two versions of one fact may share a day. Returns the longest chain. */
async function assertOneVersionPerDay(): Promise<number> {
	const facts = await listFacts(db, brandId);
	const byId = new Map(facts.map((fact) => [fact.id, fact]));
	let longest = 0;
	let seen = 0;
	for (const fact of facts.filter((f) => !f.supersedes)) {
		const chain = [fact];
		let next = fact.supersededBy;
		while (next) {
			const version = byId.get(next);
			if (!version) throw new Error("broken chain");
			chain.push(version);
			next = version.supersededBy;
		}
		seen += chain.length;
		for (let i = 1; i < chain.length; i++) {
			// Each version starts the day after the one before it ends: no overlap, no gap.
			expect(chain[i - 1].validTo).toBe(addDays(chain[i].validFrom, -1));
		}
		for (const version of chain) {
			if (version.validTo) expect(version.validTo >= version.validFrom).toBe(true);
		}
		expect(chain.slice(0, -1).every((version) => version.validTo !== null)).toBe(true);
		longest = Math.max(longest, chain.length);
	}
	// Every version is in exactly one chain, so a broken link can't hide a version from the check.
	expect(seen).toBe(facts.length);
	return longest;
}

describe("recording a change", () => {
	it("creates a new record from the change's date and ends the old one the day before", async () => {
		const old = await add("Acme Pro costs $25 per month.", "2026-01-01");

		const next = await recordFactChange(
			db,
			brandId,
			old,
			{ statement: "Acme Pro costs $29 per month.", effectiveFrom: "2026-09-01" },
			TODAY,
		);

		const facts = await listFacts(db, brandId);
		expect(facts.find((f) => f.id === old)).toMatchObject({
			validFrom: "2026-01-01",
			validTo: "2026-08-31",
			supersededBy: next,
		});
		expect(facts.find((f) => f.id === next)).toMatchObject({
			statement: "Acme Pro costs $29 per month.",
			validFrom: "2026-09-01",
			validTo: null,
			supersedes: old,
		});
		expect(await assertOneVersionPerDay()).toBe(2);
	});

	it("refuses a change on the day the current version became true, which would make two versions true that day", async () => {
		const old = await add("Acme Pro costs $25 per month.", "2026-10-23");

		expect(
			await rejection(
				recordFactChange(
					db,
					brandId,
					old,
					{ statement: "Acme Pro costs $29 per month.", effectiveFrom: "2026-10-23" },
					TODAY,
				),
			),
		).toMatch(/only one version is true on any day/);
		expect(await listFacts(db, brandId)).toHaveLength(1);
	});

	it("refuses to change a fact that has already ended, or to date a change in the future", async () => {
		const old = await add("Acme Pro costs $25 per month.");
		await recordFactChange(
			db,
			brandId,
			old,
			{ statement: "Acme Pro costs $29 per month.", effectiveFrom: "2026-05-01" },
			TODAY,
		);

		expect(
			await rejection(
				recordFactChange(
					db,
					brandId,
					old,
					{ statement: "Acme Pro costs $30 per month.", effectiveFrom: "2026-06-01" },
					TODAY,
				),
			),
		).toMatch(/still true/);
		const [current] = (await listFacts(db, brandId)).filter((f) => !f.validTo);
		expect(
			await rejection(
				recordFactChange(
					db,
					brandId,
					current.id,
					{ statement: "Acme Pro costs $30 per month.", effectiveFrom: "2026-12-01" },
					TODAY,
				),
			),
		).toMatch(/future/);
		await assertOneVersionPerDay();
	});
});

describe("retiring a fact", () => {
	it("makes the day before 'no longer true from' its last true day, once", async () => {
		const fact = await add("Acme has a free plan.", "2026-01-01");

		await retireFact(db, brandId, fact, "2026-10-01", TODAY);

		expect((await listFacts(db, brandId))[0]).toMatchObject({ validTo: "2026-09-30" });
		expect(await rejection(retireFact(db, brandId, fact, "2026-10-20", TODAY))).toMatch(/already ended/);
	});

	it("refuses to retire a fact from the day it became true or earlier", async () => {
		const fact = await add("Acme has a free plan.", "2026-10-23");

		expect(await rejection(retireFact(db, brandId, fact, "2026-10-23", TODAY))).toMatch(/day after 2026-10-23/);
	});
});

describe("deleting a fact", () => {
	it("deletes a fact recorded by mistake, before any answer was judged against it", async () => {
		const fact = await add("Acme has a fre plan.");
		expect((await listFacts(db, brandId))[0].judged).toBe(false);

		await deleteFact(db, brandId, fact);

		expect(await listFacts(db, brandId)).toEqual([]);
	});

	it("refuses once a verdict has used the fact, and keeps the verdict", async () => {
		const fact = await add("Acme has a free plan.");
		await judge(fact);
		expect((await listFacts(db, brandId))[0].judged).toBe(true);

		expect(await rejection(deleteFact(db, brandId, fact))).toMatch(/hasn't been used/);
		expect(await db.select().from(perceptionVerdicts).where(eq(perceptionVerdicts.factId, fact))).toHaveLength(1);
	});

	it("refuses to delete a fact that a change superseded, or the change itself", async () => {
		const old = await add("Acme Pro costs $25 per month.");
		const next = await recordFactChange(
			db,
			brandId,
			old,
			{ statement: "Acme Pro costs $29 per month.", effectiveFrom: "2026-05-01" },
			TODAY,
		);

		expect(await rejection(deleteFact(db, brandId, old))).toMatch(/Only an unchanged fact/);
		expect(await rejection(deleteFact(db, brandId, next))).toMatch(/Only an unchanged fact/);
		expect(await listFacts(db, brandId)).toHaveLength(2);
	});

	it("can't delete a judged fact even bypassing the check, because its verdicts refuse it", async () => {
		const fact = await add("Acme has a free plan.");
		await judge(fact);

		expect(await rejection(db.delete(brandFacts).where(eq(brandFacts.id, fact)))).toMatch(
			/perception_verdicts_fact_id/,
		);
	});
});

describe("adding facts", () => {
	it.each([
		["Does Acme have a free plan?", /assertion, not a question/],
		["Is Acme open source", /assertion, not a question/],
		["Acme has\na free plan.", /one line/],
		["Ac", /sentence/],
		["x".repeat(301), /under 300/],
	])("refuses %j", async (statement, message) => {
		expect(await rejection(add(statement))).toMatch(message);
	});

	it("refuses a date in the future and a fact already recorded, in any case or spacing", async () => {
		await add("Acme has a free plan.");

		expect(await rejection(add("Acme has a free plan.", "2026-11-01"))).toMatch(/future/);
		expect(await rejection(add("  acme HAS a free   plan. "))).toMatch(/already recorded/);
	});

	it(`allows ${MAX_ACTIVE_FACTS} active facts, and another once one is retired`, async () => {
		const ids = [];
		for (let i = 0; i < MAX_ACTIVE_FACTS; i++) ids.push(await add(`Acme fact number ${i}.`));

		expect(await rejection(add("One fact too many."))).toMatch(/at most 25/);
		await retireFact(db, brandId, ids[0], "2026-06-01", TODAY);
		expect(await rejection(add("One fact too many."))).toBe("accepted");
	});

	it("never passes the cap when adds race", async () => {
		for (let i = 0; i < MAX_ACTIVE_FACTS - 3; i++) await add(`Acme fact number ${i}.`);

		await Promise.allSettled(Array.from({ length: 10 }, (_, i) => add(`Racing fact ${i}.`)));

		expect((await listFacts(db, brandId)).filter((f) => !f.validTo)).toHaveLength(MAX_ACTIVE_FACTS);
	});
});

describe("one version per day", () => {
	it("holds over any sequence of changes and retirements", async () => {
		let seed = 20261023;
		const random = () => {
			seed = (seed * 1103515245 + 12345) % 2 ** 31;
			return seed / 2 ** 31;
		};
		const day = (offset: number) => addDays("2026-01-01", offset);
		for (let chain = 0; chain < 5; chain++) await add(`Acme claim ${chain} version 0.`, day(Math.floor(random() * 20)));

		for (let step = 0; step < 200; step++) {
			const active = (await listFacts(db, brandId)).filter((f) => !f.validTo);
			if (active.length === 0) break;
			const fact = active[Math.floor(random() * active.length)];
			const when = day(Math.floor(random() * 295));
			if (random() < 0.9) {
				await rejection(
					recordFactChange(
						db,
						brandId,
						fact.id,
						{ statement: `${fact.statement.split(" version")[0]} version ${step + 1}.`, effectiveFrom: when },
						TODAY,
					),
				);
			} else {
				await rejection(retireFact(db, brandId, fact.id, when, TODAY));
			}
			await assertOneVersionPerDay();
		}
		expect((await listFacts(db, brandId)).length).toBeGreaterThan(20);
		expect(await assertOneVersionPerDay()).toBeGreaterThan(3);
	});
});

describe("tenancy and the switch", () => {
	it("can't touch another brand's fact", async () => {
		const other = await createBrand({ name: "Globex" });
		const theirs = await add("Globex has a free plan.", "2026-01-01", other);

		expect(await rejection(retireFact(db, brandId, theirs, "2026-06-01", TODAY))).toMatch(/doesn't exist/);
		expect(
			await rejection(
				recordFactChange(
					db,
					brandId,
					theirs,
					{ statement: "Globex has no free plan.", effectiveFrom: "2026-06-01" },
					TODAY,
				),
			),
		).toMatch(/doesn't exist/);
		expect(await rejection(deleteFact(db, brandId, theirs))).toMatch(/Only an unchanged fact/);
		expect(await listFacts(db, other)).toHaveLength(1);
		await deleteBrand(other);
	});

	it("is off until turned on, and turns off again", async () => {
		expect(await isPerceptionEnabled(db, brandId)).toBe(false);
		await setPerceptionEnabled(db, brandId, true);
		expect(await isPerceptionEnabled(db, brandId)).toBe(true);
		await setPerceptionEnabled(db, brandId, false);
		expect(await isPerceptionEnabled(db, brandId)).toBe(false);
	});
});
