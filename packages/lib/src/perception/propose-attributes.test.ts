import { describe, expect, it, vi } from "vitest";
import type { Provider } from "../providers";
import { clauseNotes, failureStateProblem, mergeAttributes } from "./attribute-question";
import {
	marketPromptProblem,
	PROPOSED_ATTRIBUTES_MAX,
	proposeAttributes,
	type SampleAnswer,
	SHOWN_PER_THEME,
	screenAttributes,
	selectSample,
	WARM_ANSWER_CHARS,
	WARM_SAMPLE_CHARS,
} from "./propose-attributes";

const CONTEXT = { brandName: "Acme", aliases: ["AcmeDB"], competitors: ["Globex"], category: "hosted databases" };

const answer = (promptId: string, model: string, text: string, promptClass: string | null = null): SampleAnswer => ({
	promptId,
	prompt: `prompt ${promptId}`,
	promptClass,
	model,
	text,
});

const SAMPLE = [
	answer("p1", "chatgpt", "Acme is praised for how quickly you can get started, though pricing gets steep at scale."),
	answer("p2", "claude", "Acme's dashboard is clunky, but its realtime sync is excellent."),
];

const raw = (overrides: Partial<Record<string, string>> = {}) => ({
	label: "Getting started",
	theme: "onboarding",
	quality: "ease of getting started",
	marketPrompt: "Which hosted databases are easiest to get started with?",
	quote: "how quickly you can get started",
	...overrides,
});

/** Enough answers, across enough prompts, for a warm start. */
const WARM = Array.from({ length: 15 }, (_, i) =>
	answer(`p${i % 5}`, ["chatgpt", "claude", "gemini"][Math.floor(i / 5)], SAMPLE[0].text),
);

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
		expect(picked.map((a) => a.promptId)).toEqual(["p1", "p2", "p3", "p1"]);
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

	it("leaves out answers to fact prompts", () => {
		const picked = selectSample([
			answer("f1", "a", "Yes, Acme is open source.", "fact"),
			answer("a1", "a", "Acme is known for its developer experience.", "association"),
			answer("o1", "a", "Acme and Globex both offer hosting.", null),
		]);
		expect(picked.map((a) => a.promptId)).toEqual(["a1", "o1"]);
	});

	it(`stops at ${WARM_SAMPLE_CHARS.toLocaleString()} characters`, () => {
		const many = Array.from({ length: 40 }, (_, i) => answer(`p${i}`, "a", "y".repeat(WARM_ANSWER_CHARS)));
		expect(selectSample(many)).toHaveLength(WARM_SAMPLE_CHARS / WARM_ANSWER_CHARS);
	});
});

describe("screening proposals", () => {
	it("keeps a warm proposal whose quote is in the answers, and turns its quality into the judge's question", () => {
		const { proposals } = screenAttributes([raw()], CONTEXT, SAMPLE, []);
		expect(proposals).toEqual([
			{
				label: "Getting started",
				quality: "ease of getting started",
				theme: "onboarding",
				questionText: "How does this answer characterise {subject}'s ease of getting started?",
				marketPromptText: "Which hosted databases are easiest to get started with?",
				quote: "how quickly you can get started",
			},
		]);
	});

	it("drops a warm proposal the answers don't support, but doesn't ask a cold one for a quote", () => {
		const invented = raw({ quote: "industry-leading compliance posture" });
		expect(screenAttributes([invented], CONTEXT, SAMPLE, []).rejected[0].reason).toBe("quote isn't in the answers");
		expect(screenAttributes([raw({ quote: "" })], CONTEXT, null, []).proposals[0].quote).toBeNull();
	});

	it("drops a proposal named for a complaint, though its quote may be one", () => {
		const defects = [
			raw({ label: "Free project pausing", quality: "reliability of free projects" }),
			raw({ label: "Portability", quality: "vendor lock-in" }),
			raw({ label: "Learning curve", quality: "complexity and learning curve" }),
		];
		const { proposals, rejected } = screenAttributes(defects, CONTEXT, null, []);
		expect(proposals).toEqual([]);
		expect(rejected.map((r) => r.reason)).toEqual([
			expect.stringMatching(/"pausing" names a complaint/),
			expect.stringMatching(/"lock-in" names a complaint/),
			expect.stringMatching(/"learning curve" names a complaint/),
		]);
		const neutral = raw({
			label: "Always-on reliability",
			quality: "reliability of projects that stay online",
			quote: "pricing gets steep at scale",
		});
		expect(screenAttributes([neutral], CONTEXT, SAMPLE, []).proposals).toHaveLength(1);
	});

	it("drops a proposal that joins more than two qualities", () => {
		const three = raw({ label: "Security", quality: "security, permissions and compliance controls" });
		expect(screenAttributes([three], CONTEXT, null, []).rejected[0].reason).toBe("joins more than two qualities");
		expect(screenAttributes([raw({ quality: "speed and reliability" })], CONTEXT, null, []).proposals).toHaveLength(1);
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
				raw({ marketPrompt: "Which hosted databases have the gentlest onboarding?" }),
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

	it(`shows each theme in turn, at most ${SHOWN_PER_THEME} from any, and holds the rest back`, () => {
		const themed = (theme: string, i: number) =>
			raw({
				theme,
				label: `${theme} ${i}`,
				quality: `${theme} quality ${i}`,
				marketPrompt: `Which hosted databases rank best on ${theme} ${i}?`,
				quote: "",
			});
		const many = [
			...Array.from({ length: 4 }, (_, i) => themed("pricing", i)),
			...Array.from({ length: 4 }, (_, i) => themed("openness", i)),
			...Array.from({ length: 12 }, (_, i) => themed(`theme${i}`, 0)),
		];
		const { proposals, heldBack } = screenAttributes(many, CONTEXT, null, []);
		expect(proposals).toHaveLength(PROPOSED_ATTRIBUTES_MAX);
		expect(proposals.slice(0, 3).map((p) => p.theme)).toEqual(["pricing", "openness", "theme0"]);
		expect(proposals.filter((p) => p.theme === "pricing")).toHaveLength(SHOWN_PER_THEME);
		expect(heldBack).toHaveLength(many.length - PROPOSED_ATTRIBUTES_MAX);
	});
});

describe("attribute questions", () => {
	it("merges two proposals into one two-quality question, without a warning", () => {
		const merged = mergeAttributes(
			{ label: "Self-hosting", quality: "ease of self-hosting", marketPromptText: "Which can you self-host?" },
			{ label: "Portability", quality: "data portability", marketPromptText: "Which are most portable?" },
		);
		expect(merged).toEqual({
			label: "Self-hosting & Portability",
			quality: "ease of self-hosting and data portability",
			questionText: "How does this answer characterise {subject}'s ease of self-hosting and data portability?",
			marketPromptText: "Which can you self-host?",
		});
		expect(clauseNotes(merged.questionText)).toEqual([]);
	});

	it("warns when a merge joins three qualities", () => {
		const merged = mergeAttributes(
			{ label: "A", quality: "speed and reliability", marketPromptText: "Which?" },
			{ label: "B", quality: "price", marketPromptText: "Which?" },
		);
		expect(clauseNotes(merged.questionText)).toHaveLength(1);
	});

	it("accepts neutral dimensions", () => {
		for (const quality of [
			"pricing and value for money",
			"data portability",
			"ease of learning",
			"reliability",
			"portability of data and freedom from lock-in",
			"freedom from vendor lock-in",
		]) {
			expect(failureStateProblem(quality)).toBeNull();
		}
	});
});

describe("proposing", () => {
	it("starts warm with enough answers across enough prompts, and reports the sample it read", async () => {
		const provider = fakeProvider("openrouter", async () => ({ attributes: [raw()] }));
		const result = await proposeAttributes({
			...CONTEXT,
			existingLabels: [],
			sample: WARM,
			trackedPrompts: [],
			providers: [provider],
		});
		expect(result.grounding).toBe("warm");
		expect(result.sample).toEqual({ answers: 15, prompts: 5, models: 3, chars: 15 * SAMPLE[0].text.length });
		expect(result.proposals).toHaveLength(1);
		const prompt = vi.mocked(provider.runStructuredResearch)?.mock.calls[0][0].prompt;
		expect(prompt).toContain("how quickly you can get started");
	});

	it("starts cold when fact prompts leave too few answers, and never sends the answers it has", async () => {
		const factHeavy = WARM.map((a, i) => (i < 3 ? a : { ...a, promptClass: "fact", text: "realtime sync" }));
		const provider = fakeProvider("openrouter", async () => ({ attributes: [raw({ quote: "" })] }));
		const result = await proposeAttributes({
			...CONTEXT,
			existingLabels: [],
			sample: factHeavy,
			trackedPrompts: ["best hosted postgres"],
			providers: [provider],
		});
		expect(result.grounding).toBe("cold");
		expect(result.sample.answers).toBe(0);
		const prompt = vi.mocked(provider.runStructuredResearch)?.mock.calls[0][0].prompt ?? "";
		expect(prompt).toContain("best hosted postgres");
		expect(prompt).not.toContain("realtime sync");
		expect(prompt).not.toContain("how quickly you can get started");
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
			expect(failureStateProblem(proposal.label, proposal.quality)).toBeNull();
			expect(proposal.marketPromptText).toContain("hosted databases");
		}
	});
});
