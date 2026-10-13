/**
 * Every write that changes a brand's subjects must queue a recompute, or the
 * brand's stored analysis reads as not analysed until someone runs the
 * backfill. One row per write path; a new path has to be added here on purpose.
 */
import { MENTION_RECOMPUTE_QUEUE } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { competitors } from "@workspace/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationAuth } from "@/lib/auth/api-auth";
import { createBrand, createCompetitor, deleteBrand } from "@/test/integration/stats-fixtures";

/** Server functions run as plain functions of `{ data }`, without the Start compiler. */
vi.mock("@tanstack/react-start", () => {
	const builder = {
		validator: () => builder,
		handler: (fn: (ctx: { data: unknown }) => unknown) => (ctx: { data: unknown }) => fn(ctx),
	};
	return { createServerFn: () => builder };
});

/** Signed in, and a member of every brand's org (each fixture brand is its own org). */
vi.mock("@/lib/auth/helpers", () => ({
	requireAuthSession: vi.fn(async () => ({ user: { id: "user_1" } })),
	requireBrandSession: vi.fn(async () => ({ user: { id: "user_1" } })),
	requireBrandAccess: vi.fn(async () => {}),
	requireBrandOrganization: vi.fn(async (_userId: string, brandId: string) => ({ id: brandId, role: "admin" })),
}));

const resolveApiAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/api-auth", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/auth/api-auth")>()),
	resolveApiAuth,
}));

const brandsFns = await import("@/server/brands");
const { updateBrand, saveWizardOnboarding } = await import("@/server/onboarding-core");
const { Route: CompetitorsRoute } = await import("@/routes/api/v1/competitors/index");
const { Route: CompetitorRoute } = await import("@/routes/api/v1/competitors/$competitorId");
const { getBoss } = await import("@/lib/boss-client");

type ServerFn = (ctx: { data: Record<string, unknown> }) => Promise<unknown>;
type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;

const brandIds: string[] = [];

function orgKey(organizationId: string): OrganizationAuth {
	return {
		kind: "organization",
		keyId: "key_1",
		name: null,
		organizationId,
		organizationName: organizationId,
		scopes: new Set(["read", "write"]),
		brandIds: null,
		createdAt: null,
		lastUsedAt: null,
		expiresAt: null,
		rateLimit: { limit: 60, window: "minute" },
		rateLimitRemaining: null,
	};
}

function handlers(route: unknown) {
	return (route as { options: { server: { handlers: Record<string, Handler> } } }).options.server.handlers;
}

async function api(method: string, path: string, brandId: string, params: Record<string, string>, body?: unknown) {
	resolveApiAuth.mockResolvedValue({ auth: orgKey(brandId) });
	const route = params.competitorId ? CompetitorRoute : CompetitorsRoute;
	const res = await handlers(route)[method]({
		request: new Request(`http://localhost/api/v1${path}`, {
			method,
			headers: { "content-type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		}),
		params,
	});
	expect(res.status, await res.clone().text()).toBeLessThan(300);
}

async function competitorId(brandId: string) {
	const [row] = await db.select({ id: competitors.id }).from(competitors).where(eq(competitors.brandId, brandId));
	return row.id;
}

async function queued(brandId: string) {
	const { rows } = await db.execute<{ n: number }>(sql`
		SELECT count(*)::int AS n FROM pgboss.job
		WHERE name = ${MENTION_RECOMPUTE_QUEUE} AND singleton_key = ${brandId} AND state = 'created'`);
	return rows[0]?.n ?? 0;
}

const fn = (name: keyof typeof brandsFns) => brandsFns[name] as unknown as ServerFn;

const PATHS: Record<string, (brandId: string) => Promise<unknown>> = {
	updateBrandFn: (brandId) => fn("updateBrandFn")({ data: { brandId, aliases: ["Acme Corp"] } }),
	updateCompetitors: (brandId) =>
		fn("updateCompetitors")({
			data: { brandId, competitors: [{ name: "Initech", domains: ["initech.example"], aliases: [] }] },
		}),
	addDomainToBrandFn: (brandId) => fn("addDomainToBrandFn")({ data: { brandId, domain: "acme.example.org" } }),
	addDomainToCompetitorFn: async (brandId) =>
		fn("addDomainToCompetitorFn")({
			data: { brandId, competitorId: await competitorId(brandId), domain: "globex.example.org" },
		}),
	createCompetitorFromDomainFn: (brandId) =>
		fn("createCompetitorFromDomainFn")({ data: { brandId, name: "Initech", domain: "initech.example" } }),
	"onboarding updateBrand": (brandId) => updateBrand({ brandId, aliases: ["Acme Corp"] }),
	"onboarding saveWizardOnboarding": (brandId) =>
		saveWizardOnboarding({
			brandId,
			competitors: [{ name: "Initech", domains: ["initech.example"], aliases: [] }],
		}),
	"POST /competitors": (brandId) =>
		api("POST", "/competitors", brandId, {}, { brandId, name: "Initech", domains: ["initech.example"] }),
	"PATCH /competitors/{id}": async (brandId) => {
		const id = await competitorId(brandId);
		await api("PATCH", `/competitors/${id}`, brandId, { competitorId: id }, { aliases: ["Globex Corp"] });
	},
	"DELETE /competitors/{id}": async (brandId) => {
		const id = await competitorId(brandId);
		await api("DELETE", `/competitors/${id}`, brandId, { competitorId: id });
	},
};

beforeEach(() => {
	vi.stubEnv("DEPLOYMENT_MODE", "local");
});

afterEach(() => {
	vi.unstubAllEnvs();
});

afterAll(async () => {
	for (const id of brandIds) {
		await db.execute(sql`DELETE FROM pgboss.job WHERE name = ${MENTION_RECOMPUTE_QUEUE} AND singleton_key = ${id}`);
		await deleteBrand(id);
	}
	await (await getBoss()).stop({ graceful: false });
});

describe("every subject write path queues a mention recompute", () => {
	for (const [name, write] of Object.entries(PATHS)) {
		it(name, async () => {
			const brandId = await createBrand({ name: "Acme" });
			brandIds.push(brandId);
			await createCompetitor(brandId, "Globex", ["globex.example"]);
			expect(await queued(brandId)).toBe(0);

			await write(brandId);

			expect(await queued(brandId)).toBe(1);
		});
	}
});
