import { statementProblem } from "@workspace/lib/perception/fact-statement";
import { describe, expect, it } from "vitest";
import { JEV_MODEL, type JevRequest } from "../mention-judge/jev";
import probe from "./__fixtures__/jev-live-probe.json";
import { evidencePassages, FACT_VERDICTS, factEvidenceQuestion, factKey, factQuestion } from "./fact-questions";

// Characters that break serialisers, quoting or encodings, plus ordinary text.
const ALPHABET = [
	..."abcdefghijklmnopqrstuvwxyz ABCXYZ 0123456789 .,$%€£-/:()'",
	'"',
	"\\",
	"{",
	"}",
	"`",
	"\u00a0",
	"\u200b",
	"\u200f",
	"\u202e",
	"\u2028",
	"\u0301",
	"\ufeff",
	"\u{1f680}",
	"\u0085",
	"日本",
	"مرحبا",
];

function randomStatement(random: () => number): string {
	const length = 1 + Math.floor(random() * 290);
	let text = "Acme ";
	for (let i = 0; i < length; i++) text += ALPHABET[Math.floor(random() * ALPHABET.length)];
	// Now and then, half of a surrogate pair: a broken character only bad input produces.
	if (random() < 0.2) {
		const at = Math.floor(random() * text.length);
		text = text.slice(0, at) + (random() < 0.5 ? "\ud83d" : "\ude80") + text.slice(at);
	}
	return text;
}

/** The shape of every choice question Jev accepted in the live probe. */
function assertLegalChoiceQuestion(question: unknown) {
	const accepted = probe.accepted.request.questions.fact__self_hostable;
	expect(Object.keys(question as object).sort()).toEqual(Object.keys(accepted).sort());
	const { type, instructions, criteria } = question as { type: unknown; instructions: unknown; criteria: unknown };
	expect(type).toBe(accepted.type);
	expect(typeof instructions).toBe("string");
	expect((instructions as string).trim()).not.toBe("");
	expect(Object.keys(criteria as object)).toEqual([...FACT_VERDICTS]);
	for (const text of Object.values(criteria as object)) {
		expect(typeof text).toBe("string");
		expect((text as string).trim()).not.toBe("");
	}
}

describe("a fact that passes validation", () => {
	it("always becomes a legal Jev question", () => {
		let seed = 112;
		const random = () => {
			seed = (seed * 1103515245 + 12345) % 2 ** 31;
			return seed / 2 ** 31;
		};
		let checked = 0;
		for (let i = 0; i < 5000; i++) {
			const statement = randomStatement(random);
			if (statementProblem(statement) !== null) continue;
			checked++;
			const request: JevRequest = {
				model: JEV_MODEL,
				state: { rules: "r", question: "q", answer: "a" },
				questions: { [factKey("00000000-0000-0000-0000-000000000000")]: factQuestion("Acme", statement.trim()) },
			};
			const question = Object.values(request.questions)[0];
			assertLegalChoiceQuestion(question);
			expect(question.instructions).toContain(statement.trim());
			// JSON escapes a lone surrogate, but it is not text, and a server that decodes the body to text may refuse it.
			expect(/\p{Cs}/u.test(question.instructions)).toBe(false);
			// The body goes over the wire as UTF-8: it must encode without loss and parse back unchanged.
			const body = JSON.stringify(request);
			const decoded = new TextDecoder("utf-8", { fatal: true }).decode(new TextEncoder().encode(body));
			expect(decoded).toBe(body);
			expect(JSON.parse(decoded)).toEqual(request);
		}
		expect(checked).toBeGreaterThan(1000);
	});
});

describe("an evidence question", () => {
	it("is a legal question for any answer text, and never offers a broken character", () => {
		let seed = 6;
		const random = () => {
			seed = (seed * 1103515245 + 12345) % 2 ** 31;
			return seed / 2 ** 31;
		};
		for (let i = 0; i < 500; i++) {
			// Emoji at every offset, so some land exactly where a long passage is cut.
			const answer = Array.from(
				{ length: 4 },
				() => `Acme ${"y".repeat(Math.floor(random() * 3))}${"x\u{1f680}".repeat(Math.floor(random() * 400))}.`,
			).join(" ");
			const passages = evidencePassages(answer, { name: "Acme", aliases: [], domains: [] });
			const question = factEvidenceQuestion("Acme", "Acme can be self-hosted.", passages);

			expect(Object.keys(question.criteria)).toEqual([...passages.map((_, j) => `p${j + 1}`), "none"]);
			for (const text of Object.values(question.criteria)) {
				expect(text.trim()).not.toBe("");
				expect(/\p{Cs}/u.test(text)).toBe(false);
			}
		}
	});

	it("offers only sentences that name the subject, its alias or its domain", () => {
		const answer = "Globex is cheap. AcmeCo has a free tier. See acme.example for more. Acme is self-hostable.";
		expect(evidencePassages(answer, { name: "Acme", aliases: ["AcmeCo"], domains: ["acme.example"] })).toEqual([
			"AcmeCo has a free tier.",
			"See acme.example for more.",
			"Acme is self-hostable.",
		]);
	});
});
