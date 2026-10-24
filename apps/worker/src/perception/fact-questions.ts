import type { JevChoiceQuestion } from "../mention-judge/jev";
import { matcher, sentences } from "../mention-judge/passages";

export const FACT_VERDICTS = ["supports", "contradicts", "not_mentioned", "unclear"] as const;
export type FactVerdict = (typeof FACT_VERDICTS)[number];

/** The question key for a fact; the judge's answer comes back under the same key. */
export const factKey = (factId: string) => `fact__${factId}`;

/**
 * One closed-set question per fact, over the whole answer. The criteria follow the calibration
 * procedure's label rules (PROCEDURE.md §4), so the judge is measured against what it was asked:
 * a contradiction wins over support, a hedge doesn't soften a wrong value, and a disclaimer attached
 * to a claim makes it unclear.
 */
export function factQuestion(subject: string, statement: string): JevChoiceQuestion {
	return {
		type: "choice",
		instructions:
			`Does this answer support, contradict, or not mention the following statement about ${subject}? ` +
			`Statement: "${statement}" Judge only what the answer says about ${subject}: ignore claims about other ` +
			`companies, and sentences that name ${subject} only to contrast it with something else.`,
		criteria: {
			supports:
				`The answer states this about ${subject}, in these or equivalent words, and nothing it says on the ` +
				"point is incompatible with the statement. A range counts only if it is tight enough to be a claim " +
				"and isn't disclaimed.",
			contradicts:
				`The answer says something about ${subject} that can't be true if the statement is true: a different ` +
				"number, a negation, or an incompatible claim. This holds even if the claim is hedged with words like " +
				'"about" or "around", and even if the answer says something consistent with the statement elsewhere.',
			not_mentioned: `The answer doesn't discuss this topic for ${subject}.`,
			unclear:
				`The answer discusses this topic for ${subject} but doesn't commit to a claim that settles it: it ` +
				'attaches a "check their site" or "prices may change" disclaimer to the claim, stays qualitative, ' +
				"gives a range too wide to be a claim, or says something compatible with the statement without " +
				"asserting it.",
		},
	};
}

/** The evidence question for a fact; its answer names the passage behind the verdict. */
export const factEvidenceKey = (factId: string) => `fact__${factId}__evidence`;

/** Passages offered per evidence question, in the order the answer gives them. */
export const MAX_EVIDENCE_PASSAGES = 12;
/** A passage longer than this is cut: a table row can run on. */
export const MAX_PASSAGE_CHARS = 500;
export const NO_PASSAGE = "none";

export interface EvidenceSubject {
	name: string;
	aliases: string[];
	domains: string[];
}

/**
 * The answer's sentences that name the subject (SPEC §6.1): unlike elmo's three-sentence window,
 * a passage here never runs on into a neighbour's, because the passage is what a user checks the
 * verdict against.
 */
export function evidencePassages(text: string, subject: EvidenceSubject): string[] {
	const names = matcher(subject);
	return sentences(text)
		.map((sentence) => sentence.text)
		.filter(names)
		.slice(0, MAX_EVIDENCE_PASSAGES)
		.map((passage) => {
			// Cut by character, not UTF-16 unit, so an emoji at the cut isn't split into half a pair.
			const chars = Array.from(passage);
			return chars.length > MAX_PASSAGE_CHARS ? `${chars.slice(0, MAX_PASSAGE_CHARS).join("")}…` : passage;
		});
}

/** Which passage the verdict rests on, or none: the judge may say no passage is about it. */
export function factEvidenceQuestion(subject: string, statement: string, passages: string[]): JevChoiceQuestion {
	return {
		type: "choice",
		instructions:
			`Which passage is where this answer says what it says about the following statement about ${subject}? ` +
			`Statement: "${statement}" Pick "${NO_PASSAGE}" if no passage addresses it.`,
		criteria: {
			...Object.fromEntries(passages.map((passage, i) => [`p${i + 1}`, passage])),
			[NO_PASSAGE]: `None of these passages says anything about this statement for ${subject}.`,
		},
	};
}
