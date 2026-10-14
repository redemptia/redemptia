import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCrispWebsiteId } from "../config";

afterEach(() => vi.unstubAllEnvs());

describe("resolveCrispWebsiteId", () => {
	it.each(["cloud", "demo"])("returns the configured website ID in %s mode", (mode) => {
		vi.stubEnv("DEPLOYMENT_MODE", mode);
		vi.stubEnv("VITE_CRISP_WEBSITE_ID", "operator-inbox");

		expect(resolveCrispWebsiteId()).toBe("operator-inbox");
	});

	it("returns nothing when no inbox is configured, so no chat loads", () => {
		vi.stubEnv("DEPLOYMENT_MODE", "cloud");
		vi.stubEnv("VITE_CRISP_WEBSITE_ID", "");

		expect(resolveCrispWebsiteId()).toBeUndefined();
	});

	it.each(["local", "whitelabel"])("returns nothing in %s mode", (mode) => {
		vi.stubEnv("DEPLOYMENT_MODE", mode);
		vi.stubEnv("VITE_CRISP_WEBSITE_ID", "operator-inbox");

		expect(resolveCrispWebsiteId()).toBeUndefined();
	});

	// READ_ONLY makes a local deployment resolve to mode "demo".
	it("returns nothing for a read-only local deployment", () => {
		vi.stubEnv("DEPLOYMENT_MODE", "local");
		vi.stubEnv("READ_ONLY", "true");

		expect(resolveCrispWebsiteId()).toBeUndefined();
	});
});
