import { describe, expect, it } from "vitest";
import { buildEnvFile } from "./config";

describe("buildEnvFile", () => {
	it("explains the spend settings above them", () => {
		const file = buildEnvFile({ RUNS_PER_PROMPT: "2", DEFAULT_DELAY_HOURS: "24", APP_NAME: "x" }, "0.0.0");
		const lines = file.split("\n");
		expect(lines).toContain("RUNS_PER_PROMPT=2");
		expect(lines).toContain("DEFAULT_DELAY_HOURS=24");
		expect(lines[lines.indexOf("RUNS_PER_PROMPT=2") - 1]).toMatch(/^# .*spend/);
		expect(lines[lines.indexOf("APP_NAME=x") - 1]).not.toMatch(/^#/);
	});
});
