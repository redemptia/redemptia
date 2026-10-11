import { describe, expect, it } from "vitest";
import { analyzeMentions, locateSubject, type MentionSubject, mentionsSubject, normalizeDomain } from "./mentions";

describe("normalizeDomain", () => {
	it("reduces a URL to a bare comparable host", () => {
		expect(normalizeDomain("https://www.Acme.com/pricing?ref=x")).toBe("acme.com");
	});

	it("accepts a bare domain", () => {
		expect(normalizeDomain("www.acme.com")).toBe("acme.com");
	});

	it("falls back to the raw value rather than throwing on unparseable input", () => {
		expect(normalizeDomain("not a domain")).toBe("not a domain");
	});
});

describe("analyzeMentions", () => {
	const brand = { name: "Acme", aliases: ["Acme Corp"], domains: ["https://acme.com", "acme.io"] };

	it("finds the brand by name, case-insensitively", () => {
		expect(analyzeMentions("I would pick ACME for this.", brand, []).brandMentioned).toBe(true);
	});

	it("finds the brand by alias", () => {
		expect(analyzeMentions("Acme Corp is the incumbent.", { ...brand, name: "Zzz" }, []).brandMentioned).toBe(true);
	});

	it("finds the brand by any of its domains", () => {
		expect(analyzeMentions("See acme.io for details.", brand, []).brandMentioned).toBe(true);
	});

	it("reports no mention when nothing names the brand", () => {
		expect(analyzeMentions("Try something else entirely.", brand, []).brandMentioned).toBe(false);
	});

	it("names only the competitors the answer mentions", () => {
		const competitors = [
			{ name: "Globex", domains: ["globex.com"] },
			{ name: "Initech", domains: ["initech.com"] },
			{ name: "Hooli", domains: ["hooli.com"] },
		];
		const result = analyzeMentions("Globex and initech.com both compete here.", brand, competitors);
		expect(result.competitorsMentioned).toEqual(["Globex", "Initech"]);
	});

	it("still matches on name when a subject's domain is unparseable", () => {
		const result = analyzeMentions("Globex leads.", brand, [{ name: "Globex", domains: ["://broken"] }]);
		expect(result.competitorsMentioned).toEqual(["Globex"]);
	});

	it("does not treat a blank or whitespace alias as a mention in every answer", () => {
		const blank = { name: "Zzz", aliases: ["", " ", "\t"] };
		expect(analyzeMentions("Any answer at all.", blank, []).brandMentioned).toBe(false);
		expect(analyzeMentions("Any answer at all.", brand, [blank]).competitorsMentioned).toEqual([]);
	});

	it("does not treat a blank domain or null domain entry as a mention in every answer", () => {
		const blank = { name: "Zzz", domains: ["", " ", null, undefined] };
		expect(analyzeMentions("Any answer at all.", blank, []).brandMentioned).toBe(false);
		expect(analyzeMentions("Any answer at all.", brand, [blank]).competitorsMentioned).toEqual([]);
	});

	it("still matches real terms alongside blank ones, ignoring surrounding whitespace", () => {
		const padded = { name: "Zzz", aliases: ["", " Acme Corp "], domains: [null, " acme.io "] };
		expect(analyzeMentions("Acme Corp is the incumbent.", padded, []).brandMentioned).toBe(true);
		expect(analyzeMentions("See acme.io for details.", { ...padded, aliases: [] }, []).brandMentioned).toBe(true);
	});
});

describe("locateSubject", () => {
	const brand = { name: "Acme", aliases: ["Acme Corp"], domains: ["https://www.acme.com"] };

	it("returns null when nothing names the subject", () => {
		expect(locateSubject("try something else entirely.", brand)).toBeNull();
	});

	it("reports where the subject first appears, as an offset and a fraction of the answer", () => {
		const content = "the pick is acme, then acme again.";
		const location = locateSubject(content, brand);
		expect(location?.first).toBe(12);
		expect(location?.position).toBe(12 / content.length);
	});

	it("says which kind of term matched", () => {
		const location = locateSubject("see acme.com for details.", { ...brand, name: "Zzz", aliases: [] });
		expect(location?.spans).toEqual([{ start: 4, end: 12, kind: "domain" }]);
	});

	it("counts each repeat, and an alias overlapping the name once", () => {
		const location = locateSubject("acme corp leads; acme follows.", brand);
		expect(location?.count).toBe(2);
		expect(location?.spans).toEqual([
			{ start: 0, end: 9, kind: "alias" },
			{ start: 0, end: 4, kind: "name" },
			{ start: 17, end: 21, kind: "name" },
		]);
	});

	it("reports a term listed under two kinds once, as the name", () => {
		const location = locateSubject("acme wins.", { name: "Acme", aliases: ["ACME", " acme "] });
		expect(location?.spans).toEqual([{ start: 0, end: 4, kind: "name" }]);
	});

	it("gives offsets into the lowercased content, which can be longer than the original", () => {
		const original = "İstanbul picks Acme.";
		const location = locateSubject(original.toLowerCase(), brand);
		expect(original.indexOf("Acme")).toBe(15);
		expect(location?.first).toBe(16);
	});
});

/** The matching rule before locateSubject existed, kept verbatim as the reference. */
function referenceMentions(contentLower: string, subject: MentionSubject): boolean {
	const contains = (term: string | null | undefined) => {
		const needle = term?.trim().toLowerCase();
		return !!needle && contentLower.includes(needle);
	};
	const names = [subject.name, ...(subject.aliases ?? [])];
	if (names.some((name) => contains(name))) return true;
	return (subject.domains ?? []).some((domain) => domain != null && contains(normalizeDomain(domain)));
}

function seededRandom(seed: number) {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

describe("locateSubject agrees with the reference matching rule", () => {
	const random = seededRandom(20261011);
	const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
	// A small alphabet, so random terms hit often; "İ" changes length when lowercased.
	const alphabet = ["a", "b", "c", "A", "B", " ", ".", "-", "İ", "/"];
	const randomText = (max: number) => Array.from({ length: Math.floor(random() * max) }, () => pick(alphabet)).join("");
	const termFrom = (content: string): string | null | undefined => {
		const roll = random();
		if (roll < 0.35 && content.length > 0) {
			const start = Math.floor(random() * content.length);
			return content.slice(start, start + 1 + Math.floor(random() * 4));
		}
		if (roll < 0.5) return pick(["", " ", "\t", null, undefined]);
		if (roll < 0.6) return ` ${randomText(4)} `;
		if (roll < 0.7) return `https://www.${randomText(4)}.c/x`;
		return randomText(5);
	};
	const cases = Array.from({ length: 3000 }, () => {
		const content = randomText(40);
		const subject: MentionSubject = {
			name: termFrom(content) ?? "",
			aliases: random() < 0.2 ? null : Array.from({ length: Math.floor(random() * 3) }, () => termFrom(content) ?? ""),
			domains: random() < 0.2 ? null : Array.from({ length: Math.floor(random() * 3) }, () => termFrom(content)),
		};
		return { contentLower: content.toLowerCase(), subject };
	});

	it("generates both outcomes often enough to mean something", () => {
		const hits = cases.filter(({ contentLower, subject }) => referenceMentions(contentLower, subject)).length;
		expect(hits).toBeGreaterThan(cases.length * 0.2);
		expect(hits).toBeLessThan(cases.length * 0.8);
	});

	it("locates a subject exactly when the reference rule says it is mentioned, and not otherwise", () => {
		for (const { contentLower, subject } of cases) {
			const expected = referenceMentions(contentLower, subject);
			expect({ contentLower, subject, located: locateSubject(contentLower, subject) !== null }).toEqual({
				contentLower,
				subject,
				located: expected,
			});
			expect(mentionsSubject(contentLower, subject)).toBe(expected);
		}
	});

	it("only reports spans that are a term of the stated kind, at the stated offsets", () => {
		for (const { contentLower, subject } of cases) {
			const location = locateSubject(contentLower, subject);
			if (!location) continue;
			const needles = (terms: (string | null | undefined)[]) =>
				terms.map((term) => term?.trim().toLowerCase()).filter((needle): needle is string => !!needle);
			const byKind = {
				name: needles([subject.name]),
				alias: needles(subject.aliases ?? []),
				domain: needles((subject.domains ?? []).filter((d) => d != null).map((d) => normalizeDomain(d as string))),
			};
			for (const span of location.spans) {
				expect(byKind[span.kind]).toContain(contentLower.slice(span.start, span.end));
			}
			expect(location.first).toBe(Math.min(...location.spans.map((span) => span.start)));
			expect(location.position).toBeGreaterThanOrEqual(0);
			expect(location.position).toBeLessThan(1);
			expect(location.count).toBeGreaterThanOrEqual(1);
			expect(location.count).toBeLessThanOrEqual(location.spans.length);
		}
	});
});
