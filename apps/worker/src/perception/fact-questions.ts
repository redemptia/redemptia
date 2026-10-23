import type { JevChoiceQuestion } from "../mention-judge/jev";

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
