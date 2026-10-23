import { describe, expect, it } from "vitest";
import { estimatePerceptionCost } from "@/lib/perception-cost";

const inputs = {
	factPrompts: 10,
	targets: [
		{ model: "chatgpt", costPerRunUsd: 0.01 },
		{ model: "google-ai-mode", costPerRunUsd: 0.004 },
	],
	intervalHours: 24,
	replication: 5,
};

describe("the perception cost estimate", () => {
	it("multiplies prompts, models, runs a day and samples per run, as the worker spends them", () => {
		const estimate = estimatePerceptionCost(inputs, true);

		// 10 prompts × 2 models × 1 run a day × 5 samples = 100 answers a day, 3,000 a month.
		expect(estimate.answersPerDay).toBe(100);
		expect(estimate.answersPerMonth).toBe(3000);
		// Per prompt: ($0.01 + $0.004) × 1 × 5 × 30 = $2.10, the figure SPEC §10 quotes.
		expect(estimate.providerUsdPerPromptPerMonth).toBeCloseTo(2.1);
		expect(estimate.providerUsdPerMonth).toBeCloseTo(21);
		// Elmo's $0.15–0.35 per 1,000 answers.
		expect(estimate.mentionJudgeUsdPerMonth.low).toBeCloseTo(0.45);
		expect(estimate.mentionJudgeUsdPerMonth.high).toBeCloseTo(1.05);
		expect(estimate.factChecksPerDay).toBe(100);
	});

	it("follows a faster cadence", () => {
		expect(estimatePerceptionCost({ ...inputs, intervalHours: 6 }, true).answersPerDay).toBe(400);
	});

	it("estimates for the starting number of prompts when a brand has none yet, and says so", () => {
		const estimate = estimatePerceptionCost({ ...inputs, factPrompts: 0 }, true);
		expect(estimate.assumedFactPrompts).toBe(10);
		expect(estimate.answersPerDay).toBe(100);
	});

	it("shows no provider dollars when a target's cost is unknown, or to a viewer who doesn't pay the bills", () => {
		const unknown = { ...inputs, targets: [...inputs.targets, { model: "claude", costPerRunUsd: null }] };
		expect(estimatePerceptionCost(unknown, true).providerUsdPerMonth).toBeNull();
		expect(estimatePerceptionCost(inputs, false).providerUsdPerMonth).toBeNull();
		expect(estimatePerceptionCost(inputs, false).answersPerMonth).toBe(3000);
	});
});
