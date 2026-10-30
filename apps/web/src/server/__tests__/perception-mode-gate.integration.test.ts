import { resetDeploymentCache } from "@workspace/deployment";
import { db } from "@workspace/lib/db/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPerceptionSettingsFn, setPerceptionEnabledFn } from "@/server/perception-facts";
import { isPerceptionEnabled } from "@/server/perception-facts-core";
import { getMarketReadoutFn } from "@/server/perception-market";
import { createBrand, deleteBrand } from "@/test/integration/stats-fixtures";

// Server functions need TanStack Start's request context; this runs their handlers directly instead.
vi.mock("@tanstack/react-start", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-start")>()),
	createServerFn: () => {
		let schema: { parse: (input: unknown) => unknown } | undefined;
		const builder = {
			validator(next: typeof schema) {
				schema = next;
				return builder;
			},
			handler(fn: (ctx: { data: unknown }) => unknown) {
				return ({ data }: { data: unknown }) => fn({ data: schema ? schema.parse(data) : data });
			},
		};
		return builder;
	},
}));
vi.mock("@/lib/auth/helpers", () => ({ requireBrandSession: async () => {} }));

let brandId: string;

beforeEach(async () => {
	brandId = await createBrand({ name: "Acme" });
});

afterEach(async () => {
	vi.unstubAllEnvs();
	resetDeploymentCache();
	await deleteBrand(brandId);
});

function deployedAs(mode: "local" | "cloud" | "demo") {
	vi.stubEnv("DEPLOYMENT_MODE", mode === "demo" ? "local" : mode);
	vi.stubEnv("READ_ONLY", mode === "demo" ? "true" : "false");
	resetDeploymentCache();
}

describe("perception server functions by deployment mode", () => {
	it("turns perception on in a local deployment", async () => {
		deployedAs("local");
		await setPerceptionEnabledFn({ data: { brandId, enabled: true } });
		expect(await isPerceptionEnabled(db, brandId)).toBe(true);
	});

	it.each(["cloud", "demo"] as const)("refuses to turn perception on in %s", async (mode) => {
		deployedAs(mode);
		await expect(setPerceptionEnabledFn({ data: { brandId, enabled: true } })).rejects.toThrow(
			"Perception isn't available in this deployment mode",
		);
		expect(await isPerceptionEnabled(db, brandId)).toBe(false);
	});

	it.each(["cloud", "demo"] as const)("refuses the readouts in %s", async (mode) => {
		deployedAs(mode);
		await expect(getPerceptionSettingsFn({ data: { brandId } })).rejects.toThrow("deployment mode");
		await expect(getMarketReadoutFn({ data: { brandId } })).rejects.toThrow("deployment mode");
	});
});
