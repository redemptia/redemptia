import { describe, expect, it } from "vitest";
import { DEFAULT_ENRICHMENT_DAILY_CAP_USD, enrichmentDailyCapUsd } from "./ceiling";

describe("enrichmentDailyCapUsd", () => {
	it("defaults to $2", () => {
		expect(enrichmentDailyCapUsd({})).toBe(2);
		expect(DEFAULT_ENRICHMENT_DAILY_CAP_USD).toBe(2);
	});

	it("reads a configured cap, including zero to switch enrichment spend off", () => {
		expect(enrichmentDailyCapUsd({ ENRICHMENT_DAILY_CAP_USD: "0.5" })).toBe(0.5);
		expect(enrichmentDailyCapUsd({ ENRICHMENT_DAILY_CAP_USD: "0" })).toBe(0);
	});

	it("falls back to the default rather than lifting the cap on a bad value", () => {
		expect(enrichmentDailyCapUsd({ ENRICHMENT_DAILY_CAP_USD: "lots" })).toBe(2);
		expect(enrichmentDailyCapUsd({ ENRICHMENT_DAILY_CAP_USD: "-1" })).toBe(2);
	});
});
