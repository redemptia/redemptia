/**
 * The mention read through its real edges, as a caller from another tenant.
 * Each edge gates the brand itself before calling the core, so each is checked
 * on its own: removing either gate must turn its own test red.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationAuth, Principal } from "@/lib/auth/api-auth";
import { createBrand, createPrompt, createRun, deleteBrand } from "@/test/integration/stats-fixtures";

const resolveApiAuth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/api-auth", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/auth/api-auth")>()),
	resolveApiAuth,
}));

const { Route } = await import("@/routes/api/v1/brands/$brandId/mention-prominence");
const { getMentionProminence } = await import("@/lib/mcp/tools/analytics");

let ownBrand: string;
let otherBrand: string;

beforeAll(async () => {
	ownBrand = await createBrand();
	otherBrand = await createBrand();
	const promptId = await createPrompt(otherBrand);
	await createRun(otherBrand, promptId, { at: "2026-10-01T12:00:00Z", brandMentioned: true });
});

afterAll(async () => {
	await deleteBrand(ownBrand);
	await deleteBrand(otherBrand);
});

beforeEach(() => {
	vi.stubEnv("DEPLOYMENT_MODE", "local");
});

function ownOrganizationKey(): OrganizationAuth {
	return {
		kind: "organization",
		keyId: "key_1",
		name: null,
		organizationId: ownBrand,
		organizationName: ownBrand,
		scopes: new Set(["read"]),
		brandIds: null,
		createdAt: null,
		lastUsedAt: null,
		expiresAt: null,
		rateLimit: { limit: 60, window: "minute" },
		rateLimitRemaining: null,
	};
}

function ownOrganizationSession(): Principal {
	return {
		kind: "user",
		userId: "user_1",
		email: null,
		name: null,
		organizationIds: [ownBrand],
		clientId: "client_1",
		expiresAt: null,
	};
}

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;

async function getV1(brandId: string) {
	resolveApiAuth.mockResolvedValue({ auth: ownOrganizationKey() });
	const handlers = (Route.options as unknown as { server: { handlers: { GET: Handler } } }).server.handlers;
	const query = "start=2026-10-01T00:00:00Z&end=2026-10-02T00:00:00Z";
	return handlers.GET({
		request: new Request(`http://localhost/api/v1/brands/${brandId}/mention-prominence?${query}`),
		params: { brandId },
	});
}

const WINDOW = { start: "2026-10-01T00:00:00Z", end: "2026-10-02T00:00:00Z" };

describe("GET /api/v1/brands/:brandId/mention-prominence", () => {
	it("answers for the caller's own brand", async () => {
		expect((await getV1(ownBrand)).status).toBe(200);
	});

	it("refuses another tenant's brand without revealing its runs", async () => {
		const res = await getV1(otherBrand);
		expect(res.status).toBe(404);
		expect(await res.text()).not.toContain('"runs":1');
	});
});

describe("the get_mention_prominence MCP tool", () => {
	const ctx = () => ({ auth: ownOrganizationSession(), toolNames: [] });

	it("answers for the caller's own brand", async () => {
		await expect(getMentionProminence.run(ctx(), { brandId: ownBrand, ...WINDOW })).resolves.toMatchObject({
			brandId: ownBrand,
		});
	});

	it("refuses another tenant's brand", async () => {
		await expect(getMentionProminence.run(ctx(), { brandId: otherBrand, ...WINDOW })).rejects.toThrow();
	});
});
