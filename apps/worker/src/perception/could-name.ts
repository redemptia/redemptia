/**
 * Whether an answer could name the subject: the one question that decides whether a call is worth
 * making. It errs towards yes. "No" is only ever returned when nothing in the answer, or in what it
 * cited, resembles the subject's name, an alias or its domain in any spelling, and nothing in it could
 * be an implicit reference to the subject, in text that is plainly English. A wrong "no" is a silent
 * false negative, so every doubt spends the call.
 */
import type { EvidenceSubject } from "./fact-questions";

/** Letters and digits only, lowercased, with accents folded: "Acme's", "ACME", "Ac-me" and "Àcme" alike. */
export const fold = (text: string): string =>
	text
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]/gu, "");

/** Whether `pattern` occurs in `text` with at most `k` edits (Sellers' algorithm). */
export function approxContains(text: string, pattern: string, k: number): boolean {
	if (k === 0) return text.includes(pattern);
	const m = pattern.length;
	let column = Array.from({ length: m + 1 }, (_, i) => i);
	for (let j = 0; j < text.length; j++) {
		const next = [0];
		for (let i = 1; i <= m; i++) {
			next[i] = Math.min(column[i] + 1, next[i - 1] + 1, column[i - 1] + (pattern[i - 1] === text[j] ? 0 : 1));
		}
		if (next[m] <= k) return true;
		column = next;
	}
	return false;
}

/** Edits allowed for a name of this folded length: none for short names, which would match everything. */
const editsFor = (length: number) => (length >= 8 ? 2 : length >= 4 ? 1 : 0);

const STOPWORDS = new Set(
	"the a an of and to is in that it for on with as are this be by or not but can i you we they have has was were at from which their its if so do does will would about more any no".split(
		" ",
	),
);

const IMPLICIT_REFERENCE =
	/\b(it|its|it's|they|their|theirs|them|he|she|his|her|(?:this|that|the|their|its)\s+(?:company|platform|service|product|tool|vendor|provider|brand|software|app|firm|startup|plan|tier|offering|solution))\b/i;

/** Plain English: Latin script, and enough common English words to be sure of reading it. */
function plainlyEnglish(text: string): boolean {
	if (/[^\p{Script=Latin}\p{N}\p{P}\p{S}\p{Z}\p{C}]/u.test(text)) return false;
	const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
	if (words.length < 3) return false;
	return words.filter((word) => STOPWORDS.has(word)).length / words.length >= 0.25;
}

/** The domain's own label ("acme" of "acme.example"), which an answer may use as the name. */
const labelsOf = (domain: string) =>
	domain
		.replace(/^https?:\/\/(www\.)?/i, "")
		.replace(/\/.*$/, "")
		.split(".")
		.slice(0, -1)
		.filter((label) => label.length > 0);

export function couldNameSubject(
	text: string,
	subject: EvidenceSubject,
	citations: { url: string; domain: string; title?: string }[] = [],
): boolean {
	if (!plainlyEnglish(text)) return true;
	if (IMPLICIT_REFERENCE.test(text)) return true;
	const terms = [subject.name, ...subject.aliases, ...subject.domains, ...subject.domains.flatMap(labelsOf)]
		.map(fold)
		.filter((term) => term.length > 0);
	if (terms.length === 0) return true;
	const cited = citations.map((citation) => fold(`${citation.url} ${citation.domain} ${citation.title ?? ""}`));
	const haystacks = [fold(text), ...cited];
	return terms.some((term) => haystacks.some((haystack) => approxContains(haystack, term, editsFor(term.length))));
}
