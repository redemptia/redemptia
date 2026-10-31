import { describe, expect, it } from "vitest";
import { approxContains, couldNameSubject, fold } from "./could-name";

const subject = { name: "Acme", aliases: ["Acme Inc"], domains: ["acme.example"] };
const could = (text: string, citations: { url: string; domain: string; title?: string }[] = []) =>
	couldNameSubject(text, subject, citations);

/** Answers that name the subject, or might, in a form a careless matcher misses. Each must spend the call. */
const NEAR_MISSES: [string, string][] = [
	["the name", "Acme starts at $25 per month on the Pro plan."],
	["a possessive", "Pricing is clear, and Acme's Pro plan is $25 per month."],
	["a curly possessive", "The Pro plan from Acme’s lineup is $25."],
	["a plural", "Two Acmes were compared, and the cheaper one is $25."],
	["hyphenated onto another word", "The Acme-Cloud plan costs $50 per month."],
	["split by a hyphen", "The Ac-me plan costs $25 per month."],
	["spaced out", "Plans from A C M E start at $25 per month."],
	["upper case", "ACME PRO COSTS $25 PER MONTH ACCORDING TO THE VENDOR."],
	["lower case", "you can get acme for $25 per month on the pro plan."],
	["an accent", "The Pro plan from Àcme is $25 per month for the team."],
	["a misspelling, one letter off", "Acmee offers a Pro plan at $25 per month."],
	["a misspelling, one letter missing", "Acm offers a Pro plan at $25 per month for teams."],
	["a transposition", "Acem offers a Pro plan at $25 per month for teams."],
	["inside a longer word", "Acmetron is a vendor with a Pro plan at $25 per month."],
	["an alias", "Acme Inc has a Pro plan at $25 per month for teams."],
	["the domain in a link target", "Pricing is on [the vendor's page](https://acme.example/pricing) for the team plan."],
	["a bare URL", "The Pro plan is a paid tier.\n\nSource: https://www.acme.example/pricing"],
	["the domain without a scheme", "Details are at acme.example/pricing for the paid tier of the plan."],
	["a pronoun for it", "It starts at $25 per month on the Pro plan."],
	["the company, implied", "The company offers a Pro plan at $25 per month."],
	["their, implied", "Their Pro plan is $25 per month for the team."],
	["another language", "Der Pro-Tarif kostet 25 Dollar pro Monat und ist günstig."],
	["a non-Latin script", "月額25ドルのProプランがあります。"],
	["too short to read", "Sorry."],
];

/** Answers that cannot name the subject. Only these may skip the call. */
const CANNOT: [string, string][] = [
	["a refusal", "I'm sorry, but I can't help with that request."],
	["only competitors", "Globex starts at $30 per month. Initech is $40 per month, and Hooli has no free plan."],
	[
		"a generic non-answer",
		"Pricing varies by region and changes often, so the best thing to do is check the official website.",
	],
];

describe("an answer that could name the subject", () => {
	it.each(NEAR_MISSES)("spends the call for %s", (_name, text) => {
		expect(could(text)).toBe(true);
	});

	it("spends the call when only what the answer cited resembles the subject", () => {
		const text = "Pricing varies by region and changes often, so the best thing to do is check the official website.";
		expect(could(text)).toBe(false);
		expect(could(text, [{ url: "https://www.acme.example/pricing", domain: "www.acme.example" }])).toBe(true);
		expect(could(text, [{ url: "https://review.example/x", domain: "review.example", title: "Acme review" }])).toBe(
			true,
		);
	});

	it.each(CANNOT)("may skip the call for %s", (_name, text) => {
		expect(could(text)).toBe(false);
	});

	it("never skips for a name too short to tell apart from ordinary words", () => {
		const short = { name: "X", aliases: [], domains: [] };
		expect(couldNameSubject("Pricing varies by region and the x plan exists.", short)).toBe(true);
	});

	it("never skips without a name to look for", () => {
		expect(
			couldNameSubject("Pricing varies by region and changes often.", { name: "", aliases: [], domains: [] }),
		).toBe(true);
	});
});

describe("the matching it is built on", () => {
	it("folds case, accents, punctuation and spacing", () => {
		expect(fold("Àc-me's  Inc.")).toBe("acmesinc");
	});

	it("finds a pattern within a number of edits, and not beyond it", () => {
		expect(approxContains("xxacmexx", "acme", 0)).toBe(true);
		expect(approxContains("xxacnexx", "acme", 0)).toBe(false);
		expect(approxContains("xxacnexx", "acme", 1)).toBe(true);
		expect(approxContains("xxaxxexx", "acme", 1)).toBe(false);
	});
});
