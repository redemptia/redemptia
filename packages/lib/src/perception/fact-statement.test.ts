import { describe, expect, it } from "vitest";
import { atomicityHints, statementProblem } from "./fact-statement";

describe("fact statements", () => {
	it("accepts a plain assertion", () => {
		expect(statementProblem("Acme's Pro plan starts at $25 per month.")).toBeNull();
		expect(atomicityHints("Acme's Pro plan starts at $25 per month.")).toEqual([]);
	});

	it("rejects questions however they're punctuated", () => {
		expect(statementProblem("Acme can be self-hosted?")).toMatch(/question/);
		expect(statementProblem("What does Acme cost")).toMatch(/question/);
	});

	it("rejects half of a surrogate pair, but not an emoji", () => {
		expect(statementProblem("Acme ships \ud83d weekly.")).toMatch(/broken characters/);
		expect(statementProblem("Acme ships \u{1f680} weekly.")).toBeNull();
	});

	it("prompts, without refusing, when a statement may hold two claims", () => {
		const twoClaims = "Acme has a free plan for up to 3 users and 500 MB of storage.";
		expect(statementProblem(twoClaims)).toBeNull();
		expect(atomicityHints(twoClaims)).toEqual([
			'It joins claims with "and", "or" or a semicolon.',
			"It contains more than one number.",
		]);
	});
});
