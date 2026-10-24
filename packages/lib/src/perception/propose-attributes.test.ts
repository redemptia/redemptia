import { describe, expect, it, vi } from "vitest";
import type { Provider } from "../providers";
import {
	clauseNotes,
	marketPromptProblem,
	mergedAttributeQuestion,
	PROPOSED_ATTRIBUTES_MAX,
	proposeAttributes,
	type SampleAnswer,
	screenAttributes,
	selectSample,
	WARM_ANSWER_CHARS,
	WARM_SAMPLE_CHARS,
} from "./propose-attributes";

const CONTEXT = { brandName: "Acme", aliases: ["AcmeDB"], competitors: ["Globex"], category: "hosted databases" };

const answer = (promptId: string, model: string, text: string): SampleAnswer => ({
	promptId,
	prompt: `prompt ${promptId}`,
	model,
	text,
});

const SAMPLE = [
	answer("p1", "chatgpt", "Acme is praised for how quickly you can get started, though pricing gets steep at scale."),
	answer("p2", "claude", "Acme's dashboard is clunky, but its realtime sync is excellent."),
];

const raw = (overrides: Partial<Record<string, string>> = {}) => ({
	label: "Getting started",
	quality: "ease of getting started",
	marketPrompt: "Which hosted databases are easiest to get started with?",
	quote: "how quickly you can get started",
	...overrides,
});

function fakeProvider(id: string, answer: () => Promise<unknown>): Provider {
	return {
		id,
		isConfigured: () => true,
		runStructuredResearch: vi.fn(async () => ({ object: await answer(), modelVersion: `${id}-model` })),
	} as unknown as Provider;
}

describe("the warm-start sample", () => {
	it("takes answers from every prompt in turn before a second from any, and caps each answer", () => {
		const long = "x".repeat(WARM_ANSWER_CHARS + 500);
		const picked = selectSample([
			answer("p1", "a", long),
			answer("p1", "b", "p1 second"),
			answer("p2", "a", "p2 first"),
			answer("p3", "a", "p3 first"),
		]);
		expect(picked.map((a) => `${a.promptId}/${a.model}`)).toEqual(["p1/a", "p2/a", "p3/a", "p1/b"]);
		expect(picked[0].text).toHaveLength(WARM_ANSWER_CHARS);
	});

	it("hears from every model even when it stops after one answer per prompt", () => {
		const models = ["chatgpt", "claude", "gemini"];
		const candidates = Array.from({ length: 6 }, (_, p) =>
			models.map((model) => answer(`p${p}`, model, `${p} ${model}`)),
		).flat();
		const firstRound = selectSample(candidates).slice(0, 6);
		expect(new Set(firstRound.map((a) => a.model))).toEqual(new Set(models));
	});

	it(`stops at ${WARM_SAMPLE_CHARS.toLocaleString()} characters`, () => {
		const many = Array.from({ length: 40 }, (_, i) => answer(`p${i}`, "a", "y".repeat(WARM_ANSWER_CHARS)));
		const picked = selectSample(many);
		expect(picked.reduce((sum, a) => sum + a.text.length, 0)).toBeLessThanOrEqual(WARM_SAMPLE_CHARS);
		expect(picked).toHaveLength(WARM_SAMPLE_CHARS / WARM_ANSWER_CHARS);
	});
});

describe("screening proposals", () => {
	it("keeps a warm proposal whose quote is in the answers, and turns its quality into the judge's question", () => {
		const { proposals } = screenAttributes([raw()], CONTEXT, SAMPLE, []);
		expect(proposals).toEqual([
			{
				label: "Getting started",
				questionText: "How does this answer characterise {subject}'s ease of getting started?",
				marketPromptText: "Which hosted databases are easiest to get started with?",
				quote: "how quickly you can get started",
				notes: [],
			},
		]);
	});

	it("drops a warm proposal the answers don't support, but doesn't ask a cold one for a quote", () => {
		const invented = raw({ quote: "industry-leading compliance posture" });
		expect(screenAttributes([invented], CONTEXT, SAMPLE, []).rejected[0].reason).toBe("quote isn't in the answers");
		expect(screenAttributes([raw({ quote: "" })], CONTEXT, null, []).proposals[0].quote).toBeNull();
	});

	it("drops a market prompt that names the brand, an alias or a competitor", () => {
		const reasons = [
			"Is Acme easy to start with?",
			"Is AcmeDB easy to start with?",
			"Is Globex easy to start with?",
		].map((marketPrompt) => screenAttributes([raw({ marketPrompt })], CONTEXT, SAMPLE, []).rejected[0]?.reason);
		expect(reasons).toEqual([
			expect.stringMatching(/names Acme/),
			expect.stringMatching(/names AcmeDB/),
			expect.stringMatching(/names Globex/),
		]);
	});

	it("drops duplicates and anything the brand already has", () => {
		const { proposals, rejected } = screenAttributes(
			[
				raw(),
				raw({ marketPrompt: "Which hosted databases have the gentlest learning curve?" }),
				raw({
					label: "Realtime",
					quality: "realtime sync",
					marketPrompt: "Which hosted databases have the best realtime sync?",
					quote: "realtime sync is excellent",
				}),
			],
			CONTEXT,
			SAMPLE,
			["realtime"],
		);
		expect(proposals.map((p) => p.label)).toEqual(["Getting started"]);
		expect(rejected.map((r) => r.reason)).toEqual(["duplicate label", "duplicate label"]);
	});

	it(`shows at most ${PROPOSED_ATTRIBUTES_MAX} and holds the rest back`, () => {
		const many = Array.from({ length: 18 }, (_, i) =>
			raw({
				label: `Quality ${i}`,
				quality: `quality ${i}`,
				marketPrompt: `Which hosted databases rank best on quality ${i}?`,
				quote: "",
			}),
		);
		const { proposals, heldBack } = screenAttributes(many, CONTEXT, null, []);
		expect(proposals).toHaveLength(PROPOSED_ATTRIBUTES_MAX);
		expect(heldBack).toHaveLength(3);
	});
});

describe("question clauses", () => {
	it("merges two qualities into one two-clause question, without a warning", () => {
		const merged = mergedAttributeQuestion("self-hosting", "freedom from lock-in");
		expect(merged).toBe("How does this answer characterise {subject}'s self-hosting and freedom from lock-in?");
		expect(clauseNotes(merged)).toEqual([]);
	});

	it("warns when a question joins three qualities", () => {
		expect(clauseNotes(mergedAttributeQuestion("speed and reliability", "price"))).toHaveLength(1);
		expect(clauseNotes("How does this answer characterise {subject}'s speed, reliability or price?")).toHaveLength(1);
	});
});

describe("proposing", () => {
	it("starts warm with enough answers, and reports the sample it read", async () => {
		const sample = Array.from({ length: 6 }, (_, i) => answer(`p${i}`, i % 2 ? "claude" : "chatgpt", SAMPLE[0].text));
		const provider = fakeProvider("openrouter", async () => ({ attributes: [raw()] }));
		const result = await proposeAttributes({
			...CONTEXT,
			existingLabels: [],
			sample,
			trackedPrompts: [],
			providers: [provider],
		});
		expect(result.grounding).toBe("warm");
		expect(result.sample).toEqual({ answers: 6, prompts: 6, models: 2, chars: 6 * SAMPLE[0].text.length });
		expect(result.proposals).toHaveLength(1);
		const prompt = vi.mocked(provider.runStructuredResearch)?.mock.calls[0][0].prompt;
		expect(prompt).toContain("how quickly you can get started");
	});

	it("starts cold with too few answers, and never sends the answers it has", async () => {
		const provider = fakeProvider("openrouter", async () => ({ attributes: [raw({ quote: "" })] }));
		const result = await proposeAttributes({
			...CONTEXT,
			existingLabels: [],
			sample: SAMPLE,
			trackedPrompts: ["best hosted postgres"],
			providers: [provider],
		});
		expect(result.grounding).toBe("cold");
		expect(result.sample.answers).toBe(0);
		const prompt = vi.mocked(provider.runStructuredResearch)?.mock.calls[0][0].prompt ?? "";
		expect(prompt).toContain("best hosted postgres");
		expect(prompt).not.toContain("realtime sync");
	});

	it("falls through to the next provider, then to the seeded list when every one fails", async () => {
		const failing = fakeProvider("openai-api", async () => {
			throw new Error("429");
		});
		const working = fakeProvider("openrouter", async () => ({ attributes: [raw({ quote: "" })] }));
		const input = { ...CONTEXT, existingLabels: ["Reliability"], sample: [], trackedPrompts: [] };
		const second = await proposeAttributes({ ...input, providers: [failing, working] });
		expect(second.answeredBy).toEqual({ provider: "openrouter", model: "openrouter-model" });
		expect(second.failures).toEqual([{ provider: "openai-api", error: "429" }]);

		const seeded = await proposeAttributes({ ...input, providers: [failing] });
		expect(seeded.grounding).toBe("seeded");
		expect(seeded.answeredBy).toBeNull();
		expect(seeded.proposals.map((p) => p.label)).not.toContain("Reliability");
		for (const proposal of seeded.proposals) {
			expect(marketPromptProblem(proposal.marketPromptText, ["Acme", "Globex"])).toBeNull();
			expect(proposal.marketPromptText).toContain("hosted databases");
		}
	});
});
