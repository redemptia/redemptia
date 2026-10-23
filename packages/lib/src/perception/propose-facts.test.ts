import { describe, expect, it, vi } from "vitest";
import type { Provider } from "../providers";
import { proposeFacts, researchProviders, type SourcePage, screenProposals } from "./propose-facts";

const PAGES: SourcePage[] = [
	{
		url: "https://acme.example/pricing",
		target: "pricing",
		readAt: "2026-10-23T12:00:00.000Z",
		text: "Pro\n$25 per user per month\nThe Free plan includes   500 MB of storage.\nSelf-host Acme with Docker.",
	},
];

const proposal = (overrides: Partial<Record<string, string>> = {}) => ({
	statement: "Acme's Pro plan costs $25 per user per month.",
	category: "Pricing",
	prompt: "What does Acme cost?",
	sourceUrl: "https://acme.example/pricing",
	quote: "$25 per user per month",
	...overrides,
});

function fakeProvider(id: string, answer: () => Promise<unknown>): Provider {
	return {
		id,
		isConfigured: () => true,
		runStructuredResearch: vi.fn(async () => ({ object: await answer(), modelVersion: `${id}-model` })),
	} as unknown as Provider;
}

describe("screening proposals", () => {
	it("keeps a checkable fact quoted from the page it cites, with when that page was read", () => {
		const { proposals, rejected } = screenProposals(
			[
				proposal({
					statement: "Acme's Free plan includes 500 MB of storage.",
					quote: "the free plan includes 500 MB of storage.",
				}),
			],
			PAGES,
			"Acme",
			[],
		);
		expect(rejected).toEqual([]);
		expect(proposals).toEqual([
			{
				statement: "Acme's Free plan includes 500 MB of storage.",
				category: "pricing",
				prompt: "What does Acme cost?",
				sourceUrl: "https://acme.example/pricing",
				target: "pricing",
				readAt: "2026-10-23T12:00:00.000Z",
				quote: "the free plan includes 500 MB of storage.",
			},
		]);
	});

	it.each([
		[{ quote: "$19 per user per month" }, "quote isn't on the cited page"],
		[{ quote: "$25" }, "quote too short to check"],
		[{ quote: "Pro: per user per month" }, "quote isn't on the cited page"],
		[{ statement: "Acme's Pro plan costs $29 per user per month." }, "quote doesn't contain the fact's figure"],
		[{ sourceUrl: "https://acme.example/elsewhere" }, "cites a page that wasn't read"],
		[{ statement: "Does Acme have a free plan?" }, /question/],
		[{ statement: "Acme has a free plan and a Pro plan." }, /not atomic/],
		[{ prompt: "What does it cost?" }, "prompt doesn't name the brand"],
		[{ prompt: "Acme pricing" }, "prompt is not a question"],
	])("drops %j", (overrides, reason) => {
		const { proposals, rejected } = screenProposals([proposal(overrides)], PAGES, "Acme", []);
		expect(proposals).toEqual([]);
		expect(rejected[0].reason).toMatch(reason);
	});

	it("drops a fact the brand already has, or a repeat, in any case or spacing", () => {
		const { proposals, rejected } = screenProposals(
			[
				proposal(),
				proposal({ statement: "acme's  pro plan costs $25 per user per month.", prompt: "How much is Acme?" }),
			],
			PAGES,
			"Acme",
			["Acme self-hosts with Docker."],
		);
		expect(proposals).toHaveLength(1);
		expect(rejected.map((r) => r.reason)).toEqual(["duplicate fact"]);
	});
});

describe("choosing what to show", () => {
	it("shows up to 15, round-robin by target, so a long pricing page can't crowd out the licence", () => {
		const pricing = Array.from(
			{ length: 20 },
			(_, i) => `Plan ${String.fromCharCode(65 + i)} costs $${i + 1}0 per month.`,
		);
		const pages: SourcePage[] = [
			{ ...PAGES[0], text: pricing.join("\n") },
			{
				url: "https://github.com/acme/acme",
				target: "licence",
				readAt: PAGES[0].readAt,
				text: "License: Apache License 2.0",
			},
		];
		const raw = [
			...pricing.map((line, i) =>
				proposal({
					statement: `Acme's ${line}`,
					quote: line,
					prompt: `What does Acme plan ${String.fromCharCode(65 + i)} cost?`,
				}),
			),
			proposal({
				statement: "Acme is licensed under the Apache License 2.0.",
				quote: "License: Apache License 2.0",
				prompt: "What licence is Acme under?",
				sourceUrl: "https://github.com/acme/acme",
			}),
		];

		const { proposals, heldBack } = screenProposals(raw, pages, "Acme", []);

		expect(proposals).toHaveLength(15);
		expect(proposals.map((p) => p.target)).toContain("licence");
		expect(heldBack).toHaveLength(6);
	});
});

describe("the provider chain", () => {
	it("falls through a failing provider to the next, and says which answered", async () => {
		const failing = fakeProvider("first", async () => {
			throw new Error("429 rate limited");
		});
		const working = fakeProvider("second", async () => ({ facts: [proposal()] }));

		const result = await proposeFacts({
			brandName: "Acme",
			website: "acme.example",
			existingStatements: [],
			providers: [failing, working],
			discovered: { pages: PAGES, coverage: [] },
		});

		expect(result.failures).toEqual([{ provider: "first", error: "429 rate limited" }]);
		expect(result.answeredBy).toEqual({ provider: "second", model: "second-model" });
		expect(result.proposals).toHaveLength(1);
	});

	it("returns no proposals, and every failure, when all providers fail", async () => {
		const result = await proposeFacts({
			brandName: "Acme",
			website: "acme.example",
			existingStatements: [],
			providers: [fakeProvider("only", async () => ({ facts: "not a list" }))],
			discovered: { pages: PAGES, coverage: [] },
		});
		expect(result.answeredBy).toBeNull();
		expect(result.proposals).toEqual([]);
		expect(result.failures.map((f) => f.provider)).toEqual(["only"]);
	});

	it("never falls through from an explicit stub target to a paid provider", () => {
		vi.stubEnv("OPENROUTER_API_KEY", "sk-test");
		try {
			expect(researchProviders({ ONBOARDING_LLM_TARGET: "openrouter:openrouter" }).map((p) => p.id)).toEqual([
				"openrouter",
			]);
			expect(researchProviders({ ONBOARDING_LLM_TARGET: "stub:stub" }).map((p) => p.id)).toEqual(["stub"]);
		} finally {
			vi.unstubAllEnvs();
		}
	});
});
