import { describe, expect, it } from "vitest";
import { sentimentAvailable } from "./availability";
import { verbatimEvidence } from "./judge";

const ANSWER =
	"Acme is the clear pick for most teams this year, while Globex is capable but expensive for small budgets.";

describe("verbatimEvidence", () => {
	it("keeps a 10–30 word span the answer really contains", () => {
		const span = "Acme is the clear pick for most teams this year, while";
		expect(verbatimEvidence(ANSWER, ` ${span} `)).toBe(span);
	});

	it("drops a span the answer never said, or one too short or long", () => {
		expect(verbatimEvidence(ANSWER, "Acme is the best tool on the market for every single team")).toBeNull();
		expect(verbatimEvidence(ANSWER, "Acme is the clear pick")).toBeNull();
		expect(verbatimEvidence(ANSWER, `${ANSWER} ${ANSWER}`)).toBeNull();
	});
});

describe("sentimentAvailable", () => {
	it("is off where enrichment is off, whatever keys exist", () => {
		expect(sentimentAvailable({ enrichment: false })).toBe(false);
	});
});
