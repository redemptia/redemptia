import { describe, expect, it } from "vitest";
import { daysBetween, lineOverDays, newerJudgeStamp, pickDominant } from "@/lib/perception-history";

describe("choosing one reading per day", () => {
	it("takes the version that judged the most answers, and reports the rest", () => {
		const options = new Map([
			["old", { answers: 30 }],
			["new", { answers: 12 }],
		]);
		expect(pickDominant(options)).toMatchObject({ key: "old", otherAnswers: 12 });
	});

	it("takes the later version on a tie, and reports nothing left out when there is one", () => {
		expect(
			pickDominant(
				new Map([
					["a", { answers: 5 }],
					["b", { answers: 5 }],
				]),
			),
		).toMatchObject({ key: "b", otherAnswers: 5 });
		expect(pickDominant(new Map([["a", { answers: 5 }]]))).toMatchObject({ key: "a", otherAnswers: 0 });
		expect(pickDominant(new Map())).toBeNull();
	});
});

describe("which judge stamp is newer on a tie", () => {
	it("prefers a real judge to the stub, whatever the strings sort as, and the later string otherwise", () => {
		const real = "perception-2+jev-1.13.0+extractor-1";
		const stub = "perception-2+stub+extractor-1";
		expect(
			pickDominant(
				new Map([
					[real, { answers: 5 }],
					[stub, { answers: 5 }],
				]),
				newerJudgeStamp,
			)?.key,
		).toBe(real);
		expect(newerJudgeStamp("perception-3+jev+extractor-1", "perception-2+jev+extractor-1")).toBe(true);
	});
});

describe("a line over days", () => {
	it("starts at the first day with data and leaves gaps, never zeros, for days with none or too few answers", () => {
		const line = lineOverDays(
			[
				{ day: "2026-10-10", answers: 20, share: 0.5 },
				{ day: "2026-10-12", answers: 4, share: 1 },
				{ day: "2026-10-13", answers: 15, share: 0.25 },
			],
			(point) => point.share,
		);
		expect(line.days).toEqual(["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"]);
		expect(line.values).toEqual([0.5, null, null, 0.25]);
		expect(line.hiddenDays).toBe(1);
	});

	it("draws nothing without data", () => {
		expect(lineOverDays([], () => 1)).toEqual({ days: [], values: [], hiddenDays: 0 });
		expect(daysBetween("2026-10-30", "2026-11-01")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
	});
});
