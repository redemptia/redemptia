import { db } from "@workspace/lib/db/db";
import { perceptionAttributes, perceptionPrompts } from "@workspace/lib/db/schema-perception";
import type { MentionAssessment, RunMentionAssessments } from "@workspace/lib/mentions";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attributeSources, competitorSetFingerprint, marketProminence } from "@/server/perception-prominence-core";
import { createBrand, createCitation, createPrompt, createRun, deleteBrand } from "@/test/integration/stats-fixtures";

let brandId: string;
let marketPrompt: string;

beforeEach(async () => {
	brandId = await createBrand({ name: "Acme" });
	await db.insert(perceptionAttributes).values({
		brandId,
		key: "attr_speed",
		label: "Speed",
		questionText: "How does this answer characterise {subject}'s speed?",
		marketPromptText: "Which databases are fastest?",
	});
	marketPrompt = await createPrompt(brandId, { value: "Which databases are fastest?" });
	await db.insert(perceptionPrompts).values({ promptId: marketPrompt, class: "market", attributeKey: "attr_speed" });
});

afterEach(async () => {
	await deleteBrand(brandId);
});

const named = (position?: number): MentionAssessment => ({ mentioned: true, probability: 0.9, position });

/** An answer judged against `competitors`, naming the brand and competitors at the positions given. */
async function answer(
	ranks: { brand?: number; competitors?: Record<string, number> },
	opts: { competitors?: string[]; model?: string; promptId?: string; at?: string } = {},
) {
	const set = opts.competitors ?? ["Globex", "Initech"];
	const assessments: RunMentionAssessments = {
		...(ranks.brand ? { brand: named(ranks.brand) } : {}),
		competitors: Object.fromEntries(Object.entries(ranks.competitors ?? {}).map(([n, p]) => [n, named(p)])),
		judged: { brand: "fp", competitors: Object.fromEntries(set.map((n) => [n, "fp"])) },
	};
	return createRun(brandId, opts.promptId ?? marketPrompt, {
		at: opts.at ?? "2026-10-20T10:00:00Z",
		brandMentioned: !!ranks.brand,
		competitors: Object.keys(ranks.competitors ?? {}),
		model: opts.model,
		assessments,
	});
}

describe("market prominence", () => {
	it("is 100 × the mean of 1/position over judged answers, with mentions and positions beside it", async () => {
		await answer({ brand: 1, competitors: { Globex: 2 } });
		await answer({ brand: 2, competitors: { Globex: 1 } });
		await answer({ competitors: { Initech: 1 } });

		const result = await marketProminence(db, brandId);
		const [row] = result.rows;
		expect(row.attributeKey).toBe("attr_speed");
		expect(row.cells.Acme).toEqual({
			answers: 3,
			distinctModelOrderings: 3,
			mentioned: 2,
			positionSum: 3,
			positioned: 2,
			prominence: 50,
		});
		expect(row.cells.Globex.prominence).toBeCloseTo((100 * (0.5 + 1)) / 3);
		expect(row.cells.Initech).toMatchObject({ answers: 3, mentioned: 1, prominence: 100 / 3 });
		expect(result.competitorSet).toEqual({
			fingerprint: competitorSetFingerprint(["Globex", "Initech"]),
			competitors: ["Globex", "Initech"],
		});
	});

	it("measures against the newest competitor set and counts the answers judged under an older one apart", async () => {
		await answer({ brand: 1 }, { competitors: ["Globex"], at: "2026-10-01T10:00:00Z" });
		await answer({ brand: 2, competitors: { Initech: 1 } }, { at: "2026-10-20T10:00:00Z" });

		const result = await marketProminence(db, brandId);
		expect(result.competitorSet?.competitors).toEqual(["Globex", "Initech"]);
		expect(result.otherSetAnswers).toBe(1);
		expect(result.rows[0].cells.Acme).toMatchObject({ answers: 1, prominence: 50 });
	});

	it("reads only market prompts, only this brand's runs, and the model asked for", async () => {
		const ordinary = await createPrompt(brandId, { value: "best databases" });
		await answer({ brand: 1 }, { promptId: ordinary });
		const other = await createBrand({ name: "Other" });
		try {
			await createRun(other, await createPrompt(other), { at: "2026-10-20T10:00:00Z", brandMentioned: true });
			await answer({ brand: 1 }, { model: "claude" });
			await answer({ brand: 2 }, { model: "chatgpt" });

			const claude = await marketProminence(db, brandId, { model: "claude" });
			expect(claude.rows[0].cells.Acme).toMatchObject({ answers: 1, prominence: 100 });
			const all = await marketProminence(db, brandId);
			expect(all.rows[0].cells.Acme.answers).toBe(2);
		} finally {
			await deleteBrand(other);
		}
	});

	it("leaves out answers the judge hasn't read", async () => {
		await createRun(brandId, marketPrompt, { at: "2026-10-20T10:00:00Z", brandMentioned: true });
		const result = await marketProminence(db, brandId);
		expect(result.rows[0].cells).toEqual({
			Acme: { answers: 0, distinctModelOrderings: 0, mentioned: 0, positionSum: 0, positioned: 0, prominence: null },
		});
		expect(result.competitorSet).toBeNull();
	});
});

describe("attribute sources", () => {
	it("counts the answers citing each page, once per answer, over all the attribute's answers", async () => {
		const first = await answer({ brand: 1 });
		const second = await answer({ brand: 2 });
		await answer({});
		await createCitation(first, "https://example.com/fast", { title: "Fast databases" });
		await createCitation(first, "https://example.com/fast", { index: 2 });
		await createCitation(second, "https://example.com/fast");
		await createCitation(second, "https://other.example/list");

		const [speed] = await attributeSources(db, brandId);
		expect(speed.attributeKey).toBe("attr_speed");
		expect(speed.answers).toBe(3);
		expect(speed.sources).toEqual([
			{ url: "https://example.com/fast", domain: "example.com", title: "Fast databases", citingAnswers: 2 },
			{ url: "https://other.example/list", domain: "other.example", title: null, citingAnswers: 1 },
		]);
	});
});
