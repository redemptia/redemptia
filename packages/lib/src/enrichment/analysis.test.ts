import { describe, expect, it } from "vitest";
import { type AnalysisSubject, analyzeRun, brandSubjects, subjectFingerprint, touchesSubjects } from "./analysis";

const brand = {
	id: "brand-1",
	name: "Acme",
	website: "https://www.acme.com",
	aliases: ["Acme Corp"],
	additionalDomains: ["acme.io"],
};
const globex = { id: "c-1", name: "Globex", aliases: [], domains: ["globex.com"] };
const initech = { id: "c-2", name: "Initech", aliases: ["Initech Inc"], domains: [] };

describe("brandSubjects", () => {
	it("matches the brand by its website as well as its additional domains", () => {
		// A name that appears in neither domain, so only the domains can match.
		const [subject] = brandSubjects({ ...brand, name: "Zenith", aliases: [] }, []);
		expect(analyzeRun("see acme.com for pricing", [subject])).toHaveLength(1);
		expect(analyzeRun("see acme.io for pricing", [subject])).toHaveLength(1);
	});
});

describe("subjectFingerprint", () => {
	const fingerprint = (b = brand, competitors: Parameters<typeof brandSubjects>[1] = [globex, initech]) =>
		subjectFingerprint(brandSubjects(b, competitors));

	it("is the same whatever order competitors are listed in", () => {
		expect(fingerprint(brand, [initech, globex])).toBe(fingerprint(brand, [globex, initech]));
	});

	it("is the same whatever order aliases and domains are stored in", () => {
		const a = fingerprint({ ...brand, aliases: ["One", "Two"], additionalDomains: ["a.com", "b.com"] });
		const b = fingerprint({ ...brand, aliases: ["Two", "One"], additionalDomains: ["b.com", "a.com"] });
		expect(a).toBe(b);
		const competitor = { id: "c-1", name: "Globex", aliases: ["G1", "G2"], domains: ["g.com", "g.io"] };
		const reversed = { ...competitor, aliases: ["G2", "G1"], domains: ["g.io", "g.com"] };
		expect(fingerprint(brand, [reversed])).toBe(fingerprint(brand, [competitor]));
	});

	it("changes when anything matching reads changes", () => {
		const base = fingerprint();
		const changed = [
			fingerprint({ ...brand, name: "Acme Inc" }),
			fingerprint({ ...brand, aliases: [...brand.aliases, "ACME"] }),
			fingerprint({ ...brand, website: "https://acme.net" }),
			fingerprint({ ...brand, additionalDomains: [] }),
			fingerprint(brand, [{ ...globex, name: "Globex Corp" }, initech]),
			fingerprint(brand, [{ ...globex, domains: ["globex.net"] }, initech]),
			fingerprint(brand, [globex, { ...initech, aliases: [] }]),
			fingerprint(brand, [globex]),
			fingerprint(brand, [globex, initech, { id: "c-3", name: "Hooli", aliases: [], domains: [] }]),
		];
		for (const value of changed) expect(value).not.toBe(base);
		expect(new Set(changed).size).toBe(changed.length);
	});

	it("tells a renamed competitor (new id) apart from the old one", () => {
		expect(fingerprint(brand, [{ ...globex, id: "c-9" }, initech])).not.toBe(fingerprint());
	});
});

describe("analyzeRun", () => {
	const subjects: AnalysisSubject[] = brandSubjects(brand, [globex, initech]);

	it("writes a row for each mentioned subject, with where it first appears", () => {
		const text = "Globex leads, then ACME.";
		expect(analyzeRun(text, subjects)).toEqual([
			{ subjectKey: "brand-1", subjectKind: "brand", subjectName: "Acme", firstOffset: 19, position: 19 / text.length },
			{ subjectKey: "c-1", subjectKind: "competitor", subjectName: "Globex", firstOffset: 0, position: 0 },
		]);
	});

	it("writes nothing for an answer that mentions no subject", () => {
		expect(analyzeRun("Nothing relevant here.", subjects)).toEqual([]);
	});

	it("writes nothing for a run with no answer text", () => {
		expect(analyzeRun(null, subjects)).toEqual([]);
	});
});

describe("touchesSubjects", () => {
	it("is true for an update to any column analysis reads", () => {
		expect(touchesSubjects({ name: "Acme Inc" })).toBe(true);
		expect(touchesSubjects({ website: "https://acme.net" })).toBe(true);
		expect(touchesSubjects({ aliases: [] })).toBe(true);
		expect(touchesSubjects({ additionalDomains: [] })).toBe(true);
	});

	it("is false for an update that leaves them alone", () => {
		expect(touchesSubjects({})).toBe(false);
		expect(touchesSubjects({ name: undefined })).toBe(false);
	});
});
