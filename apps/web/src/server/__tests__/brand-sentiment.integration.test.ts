import { db } from "@workspace/lib/db/db";
import { runTexts, stanceJudgements } from "@workspace/lib/db/schema";
import { reconcileRunAnalyses } from "@workspace/lib/enrichment/reconcile";
import { SENTIMENT_ANALYZER_VERSION } from "@workspace/lib/enrichment/sentiment";
import { insertRunText } from "@workspace/lib/run-texts";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getBrandSentiment } from "@/server/analytics-core";
import { createBrand, createCompetitor, createPrompt, createRun, deleteBrand } from "@/test/integration/stats-fixtures";

const WINDOW = { from: "2026-10-01T00:00:00Z", to: "2026-10-02T00:00:00Z", timezone: "UTC" };

const SAFE = "Acme is the pick here, and Globex is fine too.";
const RISKY = "Avoid Acme; Globex is better than Acme for this.";
const ANCHOR = "Globex beats Acme on price.";
const UNJUDGED = "Acme and Globex both exist.";
const EVIDENCE = "Avoid Acme for anything serious, it breaks under load and support never answers your tickets at all.";

let brandId: string;
let otherBrand: string;
let safePrompt: string;
let riskyPrompt: string;
const hashes = new Map<string, string>();

async function answer(brand: string, prompt: string, text: string, at: string) {
	const run = await createRun(brand, prompt, { at, brandMentioned: true });
	await insertRunText(db, run.id, text);
	const [row] = await db.select().from(runTexts).where(eq(runTexts.promptRunId, run.id));
	if (row.contentHash) hashes.set(text, row.contentHash);
	return run.id;
}

async function judge(
	text: string,
	subject: string,
	stance: (typeof stanceJudgements.$inferInsert)["stance"],
	opts: { version?: number; status?: "done" | "pending" | "failed"; evidence?: string | null } = {},
) {
	await db.insert(stanceJudgements).values({
		contentHash: hashes.get(text)!,
		subjectName: subject,
		analyzerVersion: opts.version ?? SENTIMENT_ANALYZER_VERSION,
		analyzerModel: "test",
		status: opts.status ?? "done",
		stance,
		evidence: opts.evidence ?? null,
	});
}

beforeAll(async () => {
	brandId = await createBrand({ name: "Acme" });
	await createCompetitor(brandId, "Globex");
	safePrompt = await createPrompt(brandId, { value: "best widget?" });
	riskyPrompt = await createPrompt(brandId, { value: "is acme reliable?" });

	await answer(brandId, safePrompt, SAFE, "2026-10-01T10:00:00Z");
	// Two replications with the same answer share one judgement.
	await answer(brandId, riskyPrompt, RISKY, "2026-10-01T11:00:00Z");
	await answer(brandId, riskyPrompt, RISKY, "2026-10-01T12:00:00Z");
	await answer(brandId, riskyPrompt, ANCHOR, "2026-10-01T13:00:00Z");
	await answer(brandId, safePrompt, UNJUDGED, "2026-10-01T14:00:00Z");
	await answer(brandId, safePrompt, "", "2026-10-01T15:00:00Z");
	await reconcileRunAnalyses({ brandId, batchSize: 50, pauseMs: 0, dryRun: false });

	await judge(SAFE, "Acme", "recommended");
	await judge(SAFE, "globex ", "mentioned_neutral");
	await judge(RISKY, "Acme", "disrecommended", { evidence: EVIDENCE });
	await judge(RISKY, "Globex", "recommended");
	await judge(ANCHOR, "Acme", "comparison_anchor");
	await judge(ANCHOR, "Globex", "recommended");
	// Neither of these may count: an unfinished claim and another analyzer version.
	await judge(UNJUDGED, "Acme", null, { status: "pending" });
	await judge(UNJUDGED, "Globex", "disrecommended", { version: SENTIMENT_ANALYZER_VERSION + 1 });

	// Another brand whose answers set Acme back; none of it may reach Acme's read.
	otherBrand = await createBrand({ name: "Acme" });
	const otherPrompt = await createPrompt(otherBrand, { value: "other tenant's prompt" });
	await answer(otherBrand, otherPrompt, "Never buy Acme.", "2026-10-01T10:00:00Z");
	await reconcileRunAnalyses({ brandId: otherBrand, batchSize: 50, pauseMs: 0, dryRun: false });
	await judge("Never buy Acme.", "Acme", "disrecommended");
});

afterAll(async () => {
	await db.delete(stanceJudgements).where(inArray(stanceJudgements.contentHash, [...hashes.values()]));
	await deleteBrand(brandId);
	await deleteBrand(otherBrand);
});

describe("getBrandSentiment", () => {
	it("keeps blank answers out of every denominator and counts unjudged mentions apart", async () => {
		const { coverage } = await getBrandSentiment(brandId, WINDOW);
		expect(coverage).toEqual({ runs: 6, blank: 1, analysed: 5, mentions: 10, judged: 8 });
	});

	it("reads only finished judgements of the current analyzer version", async () => {
		const { analyzerVersion, subjects } = await getBrandSentiment(brandId, WINDOW);
		expect(analyzerVersion).toBe(SENTIMENT_ANALYZER_VERSION);
		const acme = subjects.find((s) => s.kind === "brand");
		const globex = subjects.find((s) => s.name === "Globex");
		expect(acme).toMatchObject({
			mentions: 5,
			judged: 4,
			stances: { recommended: 1, disrecommended: 2, comparison_anchor: 1, mentioned_neutral: 0 },
		});
		expect(globex).toMatchObject({ mentions: 5, judged: 4, stances: { recommended: 3, disrecommended: 0 } });
	});

	it("nets recommended against disrecommended and comparison_anchor over judged mentions", async () => {
		const { subjects } = await getBrandSentiment(brandId, WINDOW);
		expect(subjects.map((s) => [s.name, s.netStanceRate])).toEqual([
			["Acme", (1 - 2 - 1) / 4],
			["Globex", 3 / 4],
		]);
	});

	it("lists only the prompts that set the brand back, with each distinct answer's evidence once", async () => {
		const { riskPrompts } = await getBrandSentiment(brandId, WINDOW);
		expect(riskPrompts).toHaveLength(1);
		const [risk] = riskPrompts;
		expect(risk).toMatchObject({
			promptId: riskyPrompt,
			value: "is acme reliable?",
			judged: 3,
			disrecommended: 2,
			comparisonAnchor: 1,
		});
		expect(risk.evidence.map((e) => [e.stance, e.evidence])).toEqual([
			["comparison_anchor", null],
			["disrecommended", EVIDENCE],
		]);
		expect(risk.evidence[1].createdAt).toBe("2026-10-01T12:00:00.000Z");
	});

	it("reports no stance, rather than a neutral one, when nothing is judged", async () => {
		const { subjects, riskPrompts } = await getBrandSentiment(brandId, WINDOW, { model: "claude" });
		expect(subjects.every((s) => s.judged === 0 && s.netStanceRate === null)).toBe(true);
		expect(riskPrompts).toEqual([]);
	});
});
