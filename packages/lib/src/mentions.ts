/**
 * Detection is deliberately blunt — case-insensitive substring matching over a
 * subject's names and bare domains — because an answer engine writes prose, not
 * markup, and any narrower rule (word boundaries, link parsing) misses the
 * "acme.com is the pick here" and "Acme's" shapes that are the whole signal.
 */

export interface MentionSubject {
	name: string;
	aliases?: string[] | null;
	domains?: (string | null | undefined)[] | null;
}

/** Malformed input falls back to the raw value: a stored typo shouldn't fail a run. */
export function normalizeDomain(urlOrDomain: string): string {
	try {
		const url = new URL(urlOrDomain.startsWith("http") ? urlOrDomain : `https://${urlOrDomain}`);
		return url.hostname.replace(/^www\./, "").toLowerCase();
	} catch {
		return urlOrDomain.replace(/^www\./, "").toLowerCase();
	}
}

/** A blank term is contained in every answer, so it has to match nothing instead. */
function needleFor(term: string | null | undefined): string | null {
	const needle = term?.trim().toLowerCase();
	return needle || null;
}

export interface SubjectSpan {
	/** Offsets into the lowercased content, end exclusive. */
	start: number;
	end: number;
	kind: "name" | "alias" | "domain";
}

export interface SubjectLocation {
	/** Where the earliest span starts. */
	first: number;
	/** `first` as a fraction of the content's length: 0 opens the answer. */
	position: number;
	/** Places the subject appears, with overlapping spans ("Acme" inside "Acme Corp") counted once. */
	count: number;
	/** Every match of every term, ordered by start. */
	spans: SubjectSpan[];
}

const KIND_PRIORITY: Record<SubjectSpan["kind"], number> = { name: 0, alias: 1, domain: 2 };

/**
 * Offsets index `contentLower`, not the original answer: lowercasing can change
 * a string's length ("İ" becomes two code units), so a span can't be applied to
 * the original text as-is. `position` is a ratio within `contentLower` and is
 * unaffected.
 */
export function locateSubject(contentLower: string, subject: MentionSubject): SubjectLocation | null {
	const terms: Array<[string | null | undefined, SubjectSpan["kind"]]> = [
		[subject.name, "name"],
		...(subject.aliases ?? []).map((alias): [string, SubjectSpan["kind"]] => [alias, "alias"]),
		...(subject.domains ?? [])
			.filter((domain): domain is string => domain != null)
			.map((domain): [string, SubjectSpan["kind"]] => [normalizeDomain(domain), "domain"]),
	];

	// Keyed by offsets so a term listed twice, or a name repeated as an alias, is one span.
	const spansByOffsets = new Map<string, SubjectSpan>();
	for (const [term, kind] of terms) {
		const needle = needleFor(term);
		if (!needle) continue;
		for (let at = contentLower.indexOf(needle); at !== -1; at = contentLower.indexOf(needle, at + needle.length)) {
			const key = `${at}:${at + needle.length}`;
			const existing = spansByOffsets.get(key);
			if (!existing || KIND_PRIORITY[kind] < KIND_PRIORITY[existing.kind]) {
				spansByOffsets.set(key, { start: at, end: at + needle.length, kind });
			}
		}
	}
	if (spansByOffsets.size === 0) return null;

	const spans = [...spansByOffsets.values()].sort((a, b) => a.start - b.start || b.end - a.end);
	let count = 0;
	let reach = -1;
	for (const span of spans) {
		if (span.start >= reach) count++;
		reach = Math.max(reach, span.end);
	}
	const first = spans[0].start;
	return { first, position: first / contentLower.length, count, spans };
}

/** Defined by `locateSubject`, so a subject can't be mentioned by one and absent from the other. */
export function mentionsSubject(contentLower: string, subject: MentionSubject): boolean {
	return locateSubject(contentLower, subject) !== null;
}

export function analyzeMentions(
	content: string,
	brand: MentionSubject,
	competitors: readonly MentionSubject[],
): { brandMentioned: boolean; competitorsMentioned: string[] } {
	const contentLower = content.toLowerCase();
	return {
		brandMentioned: mentionsSubject(contentLower, brand),
		competitorsMentioned: competitors
			.filter((competitor) => mentionsSubject(contentLower, competitor))
			.map((competitor) => competitor.name),
	};
}
