import { afterEach, describe, expect, it, vi } from "vitest";
import { MIN_RETENTION_DAYS, retentionDays, retentionHorizon } from "./retention";

describe("retentionDays", () => {
	afterEach(() => vi.restoreAllMocks());

	it("keeps everything when unset", () => {
		expect(retentionDays({})).toBeNull();
		expect(retentionDays({ ENRICHMENT_RETENTION_DAYS: " " })).toBeNull();
	});

	it("refuses a window short enough to purge what a fixed preset shows, or a malformed one, rather than purging", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect(retentionDays({ ENRICHMENT_RETENTION_DAYS: String(MIN_RETENTION_DAYS - 1) })).toBeNull();
		expect(retentionDays({ ENRICHMENT_RETENTION_DAYS: "400.5" })).toBeNull();
		expect(retentionDays({ ENRICHMENT_RETENTION_DAYS: "a year" })).toBeNull();
	});

	it("accepts a whole number of days from a year and a day up", () => {
		expect(retentionDays({ ENRICHMENT_RETENTION_DAYS: "366" })).toBe(366);
		expect(retentionDays({ ENRICHMENT_RETENTION_DAYS: "730" })).toBe(730);
	});
});

describe("retentionHorizon", () => {
	it("is that many days before now", () => {
		const now = new Date("2026-10-13T00:00:00Z");
		expect(retentionHorizon(now, { ENRICHMENT_RETENTION_DAYS: "366" })?.toISOString()).toBe("2025-10-12T00:00:00.000Z");
		expect(retentionHorizon(now, {})).toBeNull();
	});
});
