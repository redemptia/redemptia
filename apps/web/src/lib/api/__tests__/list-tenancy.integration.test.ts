/**
 * The lists that can return more than one brand's rows, called through the real
 * `/api/v1` handlers and MCP tools with no `brandId`, so the scope condition is
 * the only thing standing between a caller and another tenant's rows.
 *
 * Only the cross-brand lists are here. Every other brand-scoped core read
 * (analytics, competitors, prompts, runs, tags, opportunities, and onboarding's
 * updateBrand / saveWizardOnboarding) takes an id the edge has already gated,
 * which `lib/mcp/__tests__/tenancy.test.ts` checks. Models and reports hold no
 * tenant data, and billing is scoped by organization, not brand, so none of
 * them belong in this guard.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationAuth, Principal } from "@/lib/auth/api-auth";
import { createBrand, createCompetitor, createPrompt, deleteBrand } from "@/test/integration/stats-fixtures";

const resolveApiAuth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/api-auth", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/auth/api-auth")>()),
	resolveApiAuth,
}));

const { Route: promptsRoute } = await import("@/routes/api/v1/prompts/index");
const { Route: competitorsRoute } = await import("@/routes/api/v1/competitors/index");
const { listBrandsTool } = await import("@/lib/mcp/tools/brands");
const { listPromptsTool } = await import("@/lib/mcp/tools/prompts");

let brandId: string;
let otherBrand: string;

beforeAll(async () => {
	brandId = await createBrand();
	await createPrompt(brandId);
	await createCompetitor(brandId, "Globex");

	// Created second, so its rows sort first in every newest-first list.
	otherBrand = await createBrand();
	await createPrompt(otherBrand);
	await createCompetitor(otherBrand, "Initech");
});

afterAll(async () => {
	await deleteBrand(brandId);
	await deleteBrand(otherBrand);
});

beforeEach(() => {
	vi.stubEnv("DEPLOYMENT_MODE", "local");
});

function organizationKey(): OrganizationAuth {
	return {
		kind: "organization",
		keyId: "key_1",
		name: null,
		organizationId: brandId,
		organizationName: brandId,
		scopes: new Set(["read"]),
		brandIds: null,
		createdAt: null,
		lastUsedAt: null,
		expiresAt: null,
		rateLimit: { limit: 60, window: "minute" },
		rateLimitRemaining: null,
	};
}

/** The principal only `/api/mcp` mints. */
function oauthSession(): Principal {
	return {
		kind: "user",
		userId: "user_1",
		email: null,
		name: null,
		organizationIds: [brandId],
		clientId: "client_1",
		expiresAt: null,
	};
}

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;

async function getV1(route: { options: unknown }, path: string): Promise<{ data: { brandId: string }[] }> {
	resolveApiAuth.mockResolvedValue({ auth: organizationKey() });
	const handlers = (route.options as { server: { handlers: { GET: Handler } } }).server.handlers;
	const res = await handlers.GET({ request: new Request(`http://localhost${path}`), params: {} });
	expect(res.status).toBe(200);
	return res.json();
}

function brandIdsOf(rows: { brandId: string }[]): string[] {
	return [...new Set(rows.map((row) => row.brandId))];
}

describe("an organization key listing across brands through /api/v1", () => {
	it("sees only its own brand's prompts", async () => {
		const { data } = await getV1(promptsRoute, "/api/v1/prompts?limit=1000");
		expect(brandIdsOf(data)).toEqual([brandId]);
	});

	it("sees only its own brand's competitors", async () => {
		const { data } = await getV1(competitorsRoute, "/api/v1/competitors?limit=100");
		expect(brandIdsOf(data)).toEqual([brandId]);
	});
});

describe("an OAuth session listing across brands through MCP", () => {
	const ctx = () => ({ auth: oauthSession(), toolNames: [] });

	it("sees only its own brand's prompts", async () => {
		const { data } = (await listPromptsTool.run(ctx(), { limit: 1000 })) as { data: { brandId: string }[] };
		expect(brandIdsOf(data)).toEqual([brandId]);
	});

	it("sees only its own brands", async () => {
		const { data } = (await listBrandsTool.run(ctx(), {})) as { data: { id: string }[] };
		expect(data.map((brand) => brand.id)).toEqual([brandId]);
	});

	// No list_competitors case: the tool requires a brandId it gates first, so it
	// has no cross-brand path for a scope to guard.
});

describe("an admin principal, which has no scope condition", () => {
	it("still lists every tenant", async () => {
		const admin = { auth: { kind: "admin", scopes: null, organizationId: null } as const, toolNames: [] };
		const { data } = (await listBrandsTool.run(admin, {})) as { data: { id: string }[] };
		expect(data.map((brand) => brand.id)).toEqual(expect.arrayContaining([brandId, otherBrand]));
	});
});
