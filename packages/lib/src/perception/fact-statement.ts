/**
 * What a brand fact's statement may be. A fact becomes a judge question, and one question the judge
 * rejects sinks the whole call for that answer, so the hard rules here are what keep a fact from
 * breaking judging. The atomicity hints only prompt: a pattern can't tell whether a sentence makes
 * one claim or two.
 */

export const MAX_ACTIVE_FACTS = 25;
export const MIN_STATEMENT_CHARS = 3;
export const MAX_STATEMENT_CHARS = 300;

const QUESTION_START =
	/^(does|do|did|is|are|was|were|can|could|will|would|should|has|have|what|how|why|when|where|who|which)\b/i;

export function normalizeStatement(statement: string): string {
	return statement.trim().replace(/\s+/g, " ");
}

/** Why the statement can't be saved, or null when it can. */
export function statementProblem(statement: string): string | null {
	const text = statement.trim();
	if (/[\r\n]/.test(text)) return "A fact is one line.";
	if ([...text].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
		return "A fact can't contain control characters.";
	}
	// Half of a surrogate pair isn't a character; it only arrives from broken input, never from typing.
	if (/\p{Cs}/u.test(text)) return "A fact can't contain broken characters.";
	const normalized = normalizeStatement(text);
	if (normalized.length < MIN_STATEMENT_CHARS) return "Write the fact as a sentence.";
	if (normalized.length > MAX_STATEMENT_CHARS) return `Keep a fact under ${MAX_STATEMENT_CHARS} characters.`;
	if (normalized.endsWith("?") || QUESTION_START.test(normalized)) {
		return 'State the fact as an assertion, not a question: "Acme offers a free plan", not "Does Acme offer a free plan?"';
	}
	return null;
}

/** Signs a statement may make more than one claim. Shown as a prompt the user can dismiss, never a block. */
export function atomicityHints(statement: string): string[] {
	const text = normalizeStatement(statement);
	const hints: string[] = [];
	if (/\b(and|or)\b/i.test(text) || text.includes(";")) {
		hints.push('It joins claims with "and", "or" or a semicolon.');
	}
	const amounts = text.match(/[$€£]?\d[\d,.]*\s*(%|[kKmMgGtT]?[bB]\b|MB|GB|TB)?/g) ?? [];
	if (amounts.length > 1) hints.push("It contains more than one number.");
	return hints;
}
