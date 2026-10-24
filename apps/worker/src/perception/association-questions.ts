import { qualityOf } from "@workspace/lib/perception/attribute-question";
import type { JevChoiceQuestion } from "../mention-judge/jev";
import { NO_PASSAGE } from "./fact-questions";

export const ATTRIBUTE_VERDICTS = ["positive", "negative", "mixed", "not_discussed"] as const;
export type AttributeVerdict = (typeof ATTRIBUTE_VERDICTS)[number];
export const DRIFT_VERDICTS = ["yes", "no"] as const;

/** The question key for an attribute; the judge's answer comes back under the same key. */
export const attributeKey = (attributeId: string) => `attribute__${attributeId}`;
export const DRIFT_KEY = "drift";
export const DRIFT_EVIDENCE_KEY = "drift__evidence";

const subjectRule = (subject: string) =>
	`Judge only what the answer says about ${subject}: ignore what it says about other companies, and sentences ` +
	`that name ${subject} only to contrast it with something else.`;

/**
 * One closed-set question per attribute, over the whole answer, with the criteria the calibration
 * labellers use (PROCEDURE.md §5), so the judge is measured against what it was asked. There is no
 * "other" option: inside a question about one quality, `not_discussed` already covers everything
 * else, and the qualities no attribute covers are the drift question's.
 */
export function attributeJudgeQuestion(subject: string, questionText: string): JevChoiceQuestion {
	return {
		type: "choice",
		instructions: `${questionText.replaceAll("{subject}", subject)} ${subjectRule(subject)}`,
		criteria: {
			positive: `The answer characterises ${subject} favourably on this.`,
			negative: `The answer characterises ${subject} unfavourably on this.`,
			mixed: `The answer characterises ${subject} both favourably and unfavourably on this, or conditionally ("a good choice only if …").`,
			not_discussed: `The answer makes no judgement of ${subject} on this. A bare mention of the topic, with no judgement, is not_discussed.`,
		},
	};
}

/**
 * Whether the answer describes a quality of the subject that none of the attributes covers: the
 * signal that the attribute list has gone stale (SPEC §5.2). It lists the attributes judged in the
 * same request, so what "none of these" means is exactly the set stored beside it.
 */
const listed = (questionTexts: string[]) => questionTexts.map((text) => `- ${qualityOf(text)}`).join("\n");

export function driftQuestion(subject: string, questionTexts: string[]): JevChoiceQuestion {
	return {
		type: "choice",
		instructions:
			`Does this answer describe a quality of ${subject} that none of these covers?\n${listed(questionTexts)}\n` +
			subjectRule(subject),
		criteria: {
			yes: `The answer characterises ${subject} on a quality that none of the listed ones covers.`,
			no: `Every quality the answer characterises ${subject} on is one of the listed ones, or it characterises ${subject} on none.`,
		},
	};
}

/** Which passage describes the uncovered quality; read only when the drift answer is yes. */
export function driftEvidenceQuestion(subject: string, questionTexts: string[], passages: string[]): JevChoiceQuestion {
	return {
		type: "choice",
		instructions:
			`Which passage describes a quality of ${subject} that none of these covers?\n${listed(questionTexts)}\n` +
			`Pick "${NO_PASSAGE}" if no passage does.`,
		criteria: {
			...Object.fromEntries(passages.map((passage, i) => [`p${i + 1}`, passage])),
			[NO_PASSAGE]: `None of these passages describes such a quality of ${subject}.`,
		},
	};
}
