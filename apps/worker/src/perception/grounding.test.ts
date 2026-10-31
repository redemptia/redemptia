import { describe, expect, it } from "vitest";
import { grounding } from "./judge-runs";

const cite = (url: string) => ({ url, domain: new URL(url).hostname });
const site = ["https://www.acme.example"];

describe("what an answer cited", () => {
	it("is nothing for an answer with no citations", () => {
		expect(grounding([], site, "https://acme.example/pricing")).toEqual({
			cited: false,
			citedSite: false,
			citedSource: false,
		});
	});

	it("counts any citation, one on the brand's site or a subdomain of it, and the fact's source page", () => {
		expect(grounding([cite("https://review.example/acme")], site, null)).toEqual({
			cited: true,
			citedSite: false,
			citedSource: false,
		});
		expect(grounding([cite("https://docs.acme.example/limits")], site, null)).toMatchObject({ citedSite: true });
		expect(
			grounding([cite("https://ACME.example/Pricing/?ref=ai#plans")], site, "https://www.acme.example/pricing"),
		).toEqual({
			cited: true,
			citedSite: true,
			citedSource: true,
		});
	});

	it("doesn't take a lookalike domain for the brand's site, or another page for the source page", () => {
		expect(grounding([cite("https://notacme.example/x")], site, null).citedSite).toBe(false);
		expect(grounding([cite("https://acme.example/blog")], site, "https://acme.example/pricing").citedSource).toBe(
			false,
		);
	});
});
