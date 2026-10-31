import { describe, expect, it } from "vitest";
import { checkEnvironment, checkMigrations, projectFirstJob } from "./flip-checks";

const failing = (env: Parameters<typeof checkEnvironment>[0]) =>
	checkEnvironment(env)
		.filter((check) => !check.ok)
		.map((check) => check.name);

describe("the environment checks", () => {
	it("passes a local deployment with a real key and association off", () => {
		expect(failing({ mode: "local", key: "apikey_real", associationEnabled: false })).toEqual([]);
	});

	it("fails a missing, stub or unset key, and an unset mode", () => {
		expect(failing({ mode: "local", key: "stub", associationEnabled: false })).toEqual(["Judge key"]);
		expect(failing({ mode: "local", associationEnabled: false })).toEqual(["Judge key"]);
		expect(failing({ key: "stub", associationEnabled: false })).toEqual(["Deployment mode", "Judge key"]);
	});

	it("fails a real key in demo or cloud, on the mode and on the key", () => {
		for (const mode of ["demo", "cloud"]) {
			expect(failing({ mode, key: "apikey_real", associationEnabled: false })).toEqual([
				"Deployment mode",
				"Key suits the mode",
			]);
		}
	});

	it("fails when association is on", () => {
		expect(failing({ mode: "whitelabel", key: "apikey_real", associationEnabled: true })).toEqual([
			"Association stays off",
		]);
	});
});

describe("the migration check", () => {
	const journal = [
		{ tag: "0039_a", hash: "a" },
		{ tag: "0040_b", hash: "b" },
	];

	it("names the migrations a database is missing, and the next number", () => {
		expect(checkMigrations(journal, new Set(["a", "b"]))).toMatchObject({ ok: true });
		expect(checkMigrations(journal, new Set(["a", "b"])).detail).toContain("next number 0002");
		expect(checkMigrations(journal, new Set(["a"]))).toMatchObject({ ok: false });
		expect(checkMigrations(journal, new Set(["a"])).detail).toContain("0040_b");
	});
});

describe("the first-job projection", () => {
	it("costs nothing when nothing is pending", () => {
		expect(projectFirstJob({ perception: [], stubJudgedRuns: 0, unjudgedRuns: 0 })).toMatchObject({
			perceptionRuns: 0,
			perceptionUsd: 0,
			elmoUsdUpperBound: 0,
		});
	});

	it("prices a run at its answer's tokens plus the questions, capped at the judge's limit", () => {
		const small = projectFirstJob({
			perception: [{ class: "fact", runs: 1000, avgRawChars: 4000 }],
			stubJudgedRuns: 0,
			unjudgedRuns: 0,
		});
		expect(small.perceptionUsd).toBeCloseTo(((1000 * (1000 + 1100)) / 1e6) * 0.042, 6);
		const capped = projectFirstJob({
			perception: [{ class: "fact", runs: 1, avgRawChars: 90_000 }],
			stubJudgedRuns: 0,
			unjudgedRuns: 0,
		});
		expect(capped.perceptionUsd).toBeCloseTo(((5000 + 1100) / 1e6) * 0.042, 8);
	});
});
