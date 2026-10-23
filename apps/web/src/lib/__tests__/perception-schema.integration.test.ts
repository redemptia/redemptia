import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { brandFacts, perceptionVerdicts } from "@workspace/lib/db/schema-perception";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBrand, createPrompt, createRun, deleteBrand } from "@/test/integration/stats-fixtures";

let brandId: string;
let runId: string;

beforeAll(async () => {
	brandId = await createBrand({ name: "Acme" });
	const prompt = await createPrompt(brandId);
	runId = (await createRun(brandId, prompt, { at: "2026-03-01T10:00:00Z", brandMentioned: true })).id;
});

afterAll(async () => {
	await deleteBrand(brandId);
});

async function createFact(statement = "Acme's Pro plan starts at $25 per month.") {
	const [row] = await db
		.insert(brandFacts)
		.values({ brandId, statement, validFrom: "2026-01-01" })
		.returning({ id: brandFacts.id });
	return row.id;
}

/** Postgres's message, which drizzle wraps in its own "Failed query" error. */
async function failure(write: Promise<unknown>): Promise<string> {
	try {
		await write;
	} catch (error) {
		return String((error as { cause?: unknown }).cause ?? error);
	}
	return "succeeded";
}

describe("brand facts are immutable", () => {
	it("rejects an edit to what a fact says", async () => {
		const id = await createFact();
		expect(await failure(db.update(brandFacts).set({ statement: "$29" }).where(eq(brandFacts.id, id)))).toMatch(
			/immutable/,
		);
		expect(await failure(db.update(brandFacts).set({ validFrom: "2025-06-01" }).where(eq(brandFacts.id, id)))).toMatch(
			/immutable/,
		);
	});

	it("lets a fact be closed once, and never reopened or re-dated", async () => {
		const id = await createFact();
		await db.update(brandFacts).set({ validTo: "2026-03-01" }).where(eq(brandFacts.id, id));
		expect(await failure(db.update(brandFacts).set({ validTo: "2026-04-01" }).where(eq(brandFacts.id, id)))).toMatch(
			/immutable/,
		);
		expect(await failure(db.update(brandFacts).set({ validTo: null }).where(eq(brandFacts.id, id)))).toMatch(
			/immutable/,
		);
	});

	it("rejects pointing a fact at a different predecessor", async () => {
		const older = await createFact("Acme's Pro plan starts at $20 per month.");
		const id = await createFact();
		expect(await failure(db.update(brandFacts).set({ supersedes: older }).where(eq(brandFacts.id, id)))).toMatch(
			/immutable/,
		);
	});

	it("rejects deleting a fact that a later one supersedes", async () => {
		const older = await createFact("Acme's Pro plan starts at $20 per month.");
		await db.insert(brandFacts).values({
			brandId,
			statement: "Acme's Pro plan starts at $25 per month.",
			validFrom: "2026-02-01",
			supersedes: older,
		});
		expect(await failure(db.delete(brandFacts).where(eq(brandFacts.id, older)))).toMatch(
			/brand_facts_supersedes|immutable/,
		);
	});

	it("still lets a brand with a chain of facts be deleted", async () => {
		const other = await createBrand({ name: "Globex" });
		const [first] = await db
			.insert(brandFacts)
			.values({ brandId: other, statement: "Globex costs $10.", validFrom: "2026-01-01", validTo: "2026-02-01" })
			.returning({ id: brandFacts.id });
		await db
			.insert(brandFacts)
			.values({ brandId: other, statement: "Globex costs $12.", validFrom: "2026-02-01", supersedes: first.id });

		await db.delete(brands).where(eq(brands.id, other));
		expect(await db.select().from(brandFacts).where(eq(brandFacts.brandId, other))).toEqual([]);
		await deleteBrand(other);
	});
});

describe("a perception judgement is stored once", () => {
	const verdict = { subject: "Acme", verdict: "no", probabilities: { no: 0.9, yes: 0.1 }, stamp: "p1+e1" };

	it("rejects a second copy of the same drift judgement, though its nullable keys are all null", async () => {
		await db.insert(perceptionVerdicts).values({ ...verdict, runId, kind: "drift" });
		expect(await failure(db.insert(perceptionVerdicts).values({ ...verdict, runId, kind: "drift" }))).toMatch(
			/perception_verdicts_judgement/,
		);
	});

	it("rejects a second copy of the same fact judgement, and keeps a new stamp's", async () => {
		const factId = await createFact();
		const fact = { ...verdict, runId, kind: "fact" as const, factId, verdict: "supports" };
		await db.insert(perceptionVerdicts).values(fact);
		expect(await failure(db.insert(perceptionVerdicts).values(fact))).toMatch(/perception_verdicts_judgement/);
		await db.insert(perceptionVerdicts).values({ ...fact, stamp: "p2+e1" });
	});

	it("rejects a fact verdict that names no fact", async () => {
		expect(
			await failure(db.insert(perceptionVerdicts).values({ ...verdict, runId, kind: "fact", stamp: "p3+e1" })),
		).toMatch(/perception_verdicts_ref/);
	});
});
