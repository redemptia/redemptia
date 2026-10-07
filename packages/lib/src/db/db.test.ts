import { afterEach, describe, expect, it, vi } from "vitest";

/** The pool is built when db.ts loads, so each case loads it fresh. Nothing connects. */
async function poolMax() {
	vi.stubEnv("DATABASE_URL", "postgres://localhost:5432/unused");
	vi.resetModules();
	const { db } = await import("./db");
	return db.$client.options.max;
}

describe("database pool size", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("is 10 when DATABASE_POOL_MAX is unset", async () => {
		vi.stubEnv("DATABASE_POOL_MAX", undefined);
		await expect(poolMax()).resolves.toBe(10);
	});

	it("follows DATABASE_POOL_MAX", async () => {
		vi.stubEnv("DATABASE_POOL_MAX", "25");
		await expect(poolMax()).resolves.toBe(25);
	});

	it("stays at 10 when DATABASE_POOL_MAX is not a positive integer", async () => {
		for (const value of ["0", "-5", "2.5", "lots"]) {
			vi.stubEnv("DATABASE_POOL_MAX", value);
			await expect(poolMax(), value).resolves.toBe(10);
		}
	});
});
