import { describe, expect, it, vi } from "vitest";
import { alertOncePerDay } from "./alert-once";

describe("alertOncePerDay", () => {
	it("sends once per key per UTC day, and again the next day", () => {
		const send = vi.fn();
		const day = new Date("2026-10-31T01:00:00Z");
		for (let i = 0; i < 5; i++) alertOncePerDay("org-a", send, new Date(day.getTime() + i * 60_000));
		expect(send).toHaveBeenCalledTimes(1);
		alertOncePerDay("org-b", send, day);
		expect(send).toHaveBeenCalledTimes(2);
		alertOncePerDay("org-a", send, new Date("2026-11-01T00:00:01Z"));
		expect(send).toHaveBeenCalledTimes(3);
	});
});
