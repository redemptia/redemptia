import { describe, expect, it } from "vitest";
import { loadGoldenSet, scoreSentimentEval } from "./eval";
import { STANCES } from "./prompt";

describe("scoreSentimentEval", () => {
	it("scores agreement overall and per gold class, counting a missing judgement as wrong", () => {
		const report = scoreSentimentEval([
			{ answerId: "a", subject: "X", gold: "recommended", predicted: "recommended" },
			{ answerId: "a", subject: "Y", gold: "recommended", predicted: "mentioned_neutral" },
			{ answerId: "b", subject: "Z", gold: "disrecommended", predicted: "disrecommended" },
			{ answerId: "b", subject: "W", gold: "disrecommended", predicted: null },
		]);
		expect(report.overall).toEqual({ correct: 2, total: 4, agreement: 0.5 });
		expect(report.perClass.recommended.agreement).toBe(0.5);
		expect(report.perClass.disrecommended.agreement).toBe(0.5);
		expect(report.perClass.comparison_anchor.agreement).toBeNull();
		expect(report.confusion.disrecommended.missing).toBe(1);
	});
});

describe("golden set", () => {
	const answers = loadGoldenSet();

	it("covers every stance, and names each labelled subject in its answer", () => {
		const seen = new Set<string>();
		for (const a of answers) {
			for (const [subject, stance] of Object.entries(a.labels)) {
				expect(STANCES).toContain(stance);
				expect(a.answer.toLowerCase()).toContain(subject.toLowerCase());
				seen.add(stance);
			}
		}
		expect([...seen].sort()).toEqual([...STANCES].sort());
	});

	it("holds 100 to 150 labelled judgements", () => {
		const total = answers.reduce((n, a) => n + Object.keys(a.labels).length, 0);
		expect(total).toBeGreaterThanOrEqual(100);
		expect(total).toBeLessThanOrEqual(150);
	});
});
