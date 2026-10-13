/**
 * Stub the dashboard's brand gate to refuse and no read should get anywhere.
 * A server function that queries the database before asking the gate fails
 * some other way, and the assertion on the refusal catches it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const REFUSED = new Error("brand gate reached");

/** Server functions run as plain functions of `{ data }`, without the Start compiler. */
vi.mock("@tanstack/react-start", () => {
	const builder = {
		validator: () => builder,
		handler: (fn: (ctx: { data: unknown }) => unknown) => (ctx: { data: unknown }) => fn(ctx),
	};
	return { createServerFn: () => builder };
});

vi.mock("@/lib/auth/helpers", () => ({
	requireAuthSession: vi.fn(async () => {
		throw REFUSED;
	}),
	requireBrandSession: vi.fn(async () => {
		throw REFUSED;
	}),
	requireBrandAccess: vi.fn(async () => {
		throw REFUSED;
	}),
	requireBrandOrganization: vi.fn(async () => {
		throw REFUSED;
	}),
}));

const analysis = await import("@/server/analysis");
const helpers = await import("@/lib/auth/helpers");

type ServerFn = (ctx: { data: Record<string, unknown> }) => Promise<unknown>;

/** Hand-written: a new brand read in this file has to be added on purpose. */
const READS: Record<string, ServerFn> = {
	getMentionProminenceFn: analysis.getMentionProminenceFn as unknown as ServerFn,
	getBrandSentimentFn: analysis.getBrandSentimentFn as unknown as ServerFn,
};

beforeEach(() => {
	vi.mocked(helpers.requireBrandSession).mockClear();
});

describe("dashboard brand reads", () => {
	for (const [name, read] of Object.entries(READS)) {
		it(`${name} asks the brand gate before reading anything`, async () => {
			const data = { brandId: "another-tenants-brand", lookback: "1m", timezone: "UTC" };
			await expect(read({ data })).rejects.toBe(REFUSED);
			expect(helpers.requireBrandSession).toHaveBeenCalledWith("another-tenants-brand");
		});
	}
});
