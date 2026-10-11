import { describe, expect, it } from "vitest";
import { prominence, rankSubjects } from "./prominence";

describe("prominence", () => {
	it("is highest for a subject that opens the answer", () => {
		expect(prominence(0)).toBe(1);
	});

	it("falls in proportion to how far into the answer a subject first appears", () => {
		expect(prominence(0.25)).toBe(0.75);
		expect(prominence(0.5)).toBe(0.5);
	});

	it("is higher the earlier a subject first appears", () => {
		expect(prominence(0.1) as number).toBeGreaterThan(prominence(0.6) as number);
	});

	it("stays above zero for a subject named at the very end", () => {
		expect(prominence(0.99)).toBeGreaterThan(0);
	});

	it("is null for a subject the answer doesn't mention", () => {
		expect(prominence(null)).toBeNull();
	});
});

describe("rankSubjects", () => {
	it("ranks mentioned subjects by where each first appears", () => {
		const ranks = rankSubjects([
			{ key: "late", first: 300 },
			{ key: "early", first: 10 },
			{ key: "middle", first: 120 },
		]);
		expect(Object.fromEntries(ranks)).toEqual({ early: 1, middle: 2, late: 3 });
	});

	it("gives subjects first named at the same place the same rank, and skips past them", () => {
		const ranks = rankSubjects([
			{ key: "notion", first: 5 },
			{ key: "notion-ai", first: 5 },
			{ key: "coda", first: 40 },
		]);
		expect(Object.fromEntries(ranks)).toEqual({ notion: 1, "notion-ai": 1, coda: 3 });
	});

	it("shares a rank for a tie behind the leader too", () => {
		const ranks = rankSubjects([
			{ key: "first", first: 5 },
			{ key: "tied-a", first: 40 },
			{ key: "tied-b", first: 40 },
			{ key: "last", first: 90 },
		]);
		expect(Object.fromEntries(ranks)).toEqual({ first: 1, "tied-a": 2, "tied-b": 2, last: 4 });
	});

	it("leaves unmentioned subjects unranked and doesn't count them", () => {
		const ranks = rankSubjects([
			{ key: "absent", first: null },
			{ key: "present", first: 50 },
		]);
		expect(ranks.has("absent")).toBe(false);
		expect(ranks.get("present")).toBe(1);
	});

	it("ranks nothing when no subject is mentioned", () => {
		expect(rankSubjects([{ key: "a", first: null }]).size).toBe(0);
	});
});
