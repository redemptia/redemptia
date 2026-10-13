/**
 * The sentiment read through its real edges, as a caller from another tenant
 * whose brand has a risk prompt and evidence worth leaking.
 * Each edge gates the brand itself before calling the core, so each is checked
 * on its own: removing either gate must turn its own test red.
 */
import { db } from "@workspace/lib/db/db";
import { runTexts, stanceJudgements } from "@workspace/lib/db/schema";
import { reconcileRunAnalyses } from "@workspace/lib/enrichment/reconcile";
import { SENTIMENT_ANALYZER_VERSION } from "@workspace/lib/enrichment/sentiment";
import { insertRunText } from "@workspace/lib/run-texts";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationAuth, Principal } from "@/lib/auth/api-auth";
import { createBrand, createPrompt, createRun, deleteBrand } from "@/test/integration/stats-fixtures";

const resolveApiAuth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/api-auth", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/auth/api-auth")>()),
	resolveApiAuth,
}));

const { Route } = await import("@/routes/api/v1/brands/$brandId/sentiment");
const { getSentiment } = await import("@/lib/mcp/tools/analytics");

const SECRET_PROMPT = "other tenant's confidential prompt";
const ANSWER = "Never choose Acme, it fails constantly.";

let ownBrand: string;
let otherBrand: string;
let contentHash: string;

beforeAll(async () => {
	ownBrand = await createBrand();
	otherBrand = await createBrand({ name: "Acme" });
	const promptId = await createPrompt(otherBrand, { value: SECRET_PROMPT });
	const run = await createRun(otherBrand, promptId, { at: "2026-10-01T12:00:00Z", brandMentioned: true });
	await insertRunText(db, run.id, ANSWER);
	await reconcileRunAnalyses({ brandId: otherBrand, batchSize: 50, pauseMs: 0, dryRun: false });
	const [row] = await db.select().from(runTexts).where(eq(runTexts.promptRunId, run.id));
	contentHash = row.contentHash!;
	await db.insert(stanceJudgements).values({
		contentHash,
		subjectName: "Acme",
		analyzerVersion: SENTIMENT_ANALYZER_VERSION,
		analyzerModel: "test",
		status: "done",
		stance: "disrecommended",
	});
});

afterAll(async () => {
	await db.delete(stanceJudgements).where(eq(stanceJudgements.contentHash, contentHash));
	await deleteBrand(ownBrand);
	await deleteBrand(otherBrand);
});

beforeEach(() => {
	vi.stubEnv("DEPLOYMENT_MODE", "local");
});

afterEach(() => {
	vi.unstubAllEnvs();
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
		request: new Request(`http://localhost/api/v1/brands/${brandId}/sentiment?${query}`),
		params: { brandId },
	});
}

const WINDOW = { start: "2026-10-01T00:00:00Z", end: "2026-10-02T00:00:00Z" };

describe("GET /api/v1/brands/:brandId/sentiment", () => {
	it("answers for the caller's own brand", async () => {
		expect((await getV1(ownBrand)).status).toBe(200);
	});

	it("refuses another tenant's brand without revealing its risk prompts", async () => {
		const res = await getV1(otherBrand);
		expect(res.status).toBe(404);
		const body = await res.text();
		expect(body).not.toContain(SECRET_PROMPT);
		expect(body).not.toContain('"judged":1');
	});
});

describe("the get_sentiment MCP tool", () => {
	const ctx = () => ({ auth: ownOrganizationSession(), toolNames: [] });

	it("answers for the caller's own brand", async () => {
		await expect(getSentiment.run(ctx(), { brandId: ownBrand, ...WINDOW })).resolves.toMatchObject({
			brandId: ownBrand,
		});
	});

	it("refuses another tenant's brand", async () => {
		await expect(getSentiment.run(ctx(), { brandId: otherBrand, ...WINDOW })).rejects.toMatchObject({
			status: 404,
		});
	});
});
