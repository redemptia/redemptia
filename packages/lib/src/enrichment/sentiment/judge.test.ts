import { afterEach, describe, expect, it, vi } from "vitest";
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
	afterEach(() => vi.unstubAllEnvs());

	it("is off where enrichment is off, whatever keys exist", () => {
		expect(sentimentAvailable({ enrichment: false })).toBe(false);
	});

	it("needs the analyzer's own key: the scraper's OpenAI key doesn't count", () => {
		vi.stubEnv("SENTIMENT_API_KEY", "");
		vi.stubEnv("OPENAI_API_KEY", "scraper-key");
		expect(sentimentAvailable({ enrichment: true })).toBe(false);
		vi.stubEnv("SENTIMENT_API_KEY", "sentiment-key");
		expect(sentimentAvailable({ enrichment: true })).toBe(true);
	});
});
