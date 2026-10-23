import { describe, expect, it, vi } from "vitest";
import type { Provider } from "../providers";
import { proposeFacts, researchProviders, type SourcePage, screenProposals } from "./propose-facts";

const PAGES: SourcePage[] = [
	{
		url: "https://acme.example/pricing",
		target: "pricing",
		readAt: "2026-10-23T12:00:00.000Z",
		text: [
			"Pro",
			"$25 per user per month",
			"The Free plan includes   500 MB of storage.",
			"Run Acme on your laptop, server, or cloud.",
			"Acme is HIPAA compliant.",
			"HIPAA is available on the Team plan as a paid add-on.",
		].join("\n"),
	},
];

const proposal = (overrides: Partial<Record<string, string>> = {}) => {
	const base = {
		statement: "Acme's Pro plan costs $25 per user per month.",
		category: "Pricing",
		prompt: "What does Acme cost?",
		sourceUrl: "https://acme.example/pricing",
		quote: "$25 per user per month",
		...overrides,
	};
	return { topic: base.statement, ...base };
};

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
				topic: "acme's free plan includes 500 mb of storage.",
				notes: [],
				related: [],
			},
		]);
	});

	it("keeps a statement that may hold two claims, with the note the editor would show", () => {
		const { proposals } = screenProposals(
			[
				proposal({
					statement: "Acme runs on a laptop or a server.",
					quote: "Run Acme on your laptop, server, or cloud.",
				}),
			],
			PAGES,
			"Acme",
			[],
		);
		expect(proposals[0].notes).toEqual(['It joins claims with "and", "or" or a semicolon.']);
	});

	it("shows a qualified fact with the broader one about the same thing, qualified first", () => {
		const { proposals, heldBack } = screenProposals(
			[
				proposal({
					statement: "HIPAA compliance is available on Acme's Team plan as a paid add-on.",
					quote: "HIPAA is available on the Team plan as a paid add-on.",
					prompt: "Is Acme HIPAA compliant?",
					topic: "HIPAA",
				}),
				proposal({
					statement: "Acme is HIPAA compliant.",
					quote: "Acme is HIPAA compliant.",
					prompt: "Can I use Acme for health data?",
					topic: "hipaa",
				}),
			],
			PAGES,
			"Acme",
			[],
		);
		expect(heldBack).toEqual([]);
		expect(proposals).toHaveLength(1);
		expect(proposals[0].statement).toMatch(/Team plan/);
		expect(proposals[0].related.map((r) => r.statement)).toEqual(["Acme is HIPAA compliant."]);
	});

	it.each([
		[{ quote: "$19 per user per month" }, "quote isn't on the cited page"],
		[{ quote: "$25" }, "quote too short to check"],
		[{ quote: "Pro: per user per month" }, "quote isn't on the cited page"],
		[{ statement: "Acme's Pro plan costs $29 per user per month." }, "quote doesn't contain the fact's figure"],
		[{ sourceUrl: "https://acme.example/elsewhere" }, "cites a page that wasn't read"],
		[{ statement: "Does Acme have a free plan?" }, /question/],
		[{ prompt: "What does it cost?" }, /Name Acme in the question/],
		[{ prompt: "Acme pricing" }, /Write it as a question/],
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
