/**
 * What an attribute's judge question may be. Free of server code, so the page can merge proposals
 * and show the same warnings the server applies.
 *
 * An attribute is a neutral dimension an answer can be positive, negative or mixed about, such as
 * "reliability of projects that stay online". It is never a failure state, such as "project
 * pausing": `positive` on a defect means nothing, and the association score built on it can't be
 * read. And it asks about two qualities at most, since a four-state verdict over three (positive on
 * one, negative on another, silent on the third) has no right answer.
 */

/** The judge's question for a quality, in the one shape every attribute question takes. */
export function attributeQuestion(quality: string): string {
	return `How does this answer characterise {subject}'s ${quality
		.trim()
		.replace(/\s+/g, " ")
		.replace(/[?.]+$/, "")}?`;
}

/** A pattern can't count qualities exactly: two joiners usually means three qualities. */
export function joinsTooManyQualities(text: string): boolean {
	return (text.match(/\b(and|or)\b|[,;]/gi) ?? []).length >= 2;
}

export function clauseNotes(questionText: string): string[] {
	return joinsTooManyQualities(questionText)
		? ["It may ask about more than two qualities; keep a question to two at most."]
		: [];
}

/**
 * Words that name a complaint rather than the dimension it sits on: "pausing" where the dimension
 * is staying online, "lock-in" where it is portability, "learning curve" where it is ease of
 * learning. Answers often phrase a quality as its complaint, so a proposal read from them can too.
 * "Freedom from lock-in" names the dimension's good end, so it passes.
 */
const FAILURE_STATE =
	/(?<!\bfreedom from (vendor )?)\b(paus(e|es|ed|ing)|outages?|downtime|bugs?|buggy|crash(es|ing)?|lack(s|ing)? of|missing|limitations?|complaints?|problems?|issues?|failures?|slowness|cold starts?|lock-?in|hidden (fees|costs|charges)|surprise (bills|charges|costs)|learning curve|expensive|overpriced|clunky|stripped[- ]down|shortcomings?|drawbacks?|weakness(es)?)\b/i;

/** Why the label or quality names a failure state rather than a dimension, or null when it doesn't. */
export function failureStateProblem(...texts: string[]): string | null {
	for (const text of texts) {
		const match = text.match(FAILURE_STATE);
		if (match) {
			return `"${match[0].toLowerCase()}" names a complaint, not a quality an answer can be positive or negative about. Name the dimension instead.`;
		}
	}
	return null;
}

export interface MergeableAttribute {
	label: string;
	/** The noun phrase the question asks about, such as "ease of getting started". */
	quality: string;
	marketPromptText: string;
}

/**
 * Two proposals as one attribute, before anything is saved: both qualities in one question, which
 * is as many as a question may hold, and the first one's market prompt, which the user can change.
 */
export function mergeAttributes<T extends MergeableAttribute>(
	first: T,
	second: T,
): MergeableAttribute & { questionText: string } {
	const quality = `${first.quality.trim()} and ${second.quality.trim()}`;
	return {
		label: `${first.label.trim()} & ${second.label.trim()}`,
		quality,
		questionText: attributeQuestion(quality),
		marketPromptText: first.marketPromptText,
	};
}
