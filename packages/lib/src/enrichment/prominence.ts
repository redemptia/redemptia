/**
 * Pure, IO-free scoring of where an answer mentions each subject.
 *
 * Only a mention's first offset and position (from `locateSubject`) are ever
 * persisted. Prominence and rank are always computed on read from those, so
 * changing how either is defined needs no backfill. What does need one is a
 * change to what gets persisted, which is what `ANALYZER_VERSION` tracks.
 */

/**
 * Bump when `locateSubject` would return a different first offset or position
 * for the same text and subject (a change to the matching rule or term list).
 * Stored rows from an older version are stale and must be re-analysed.
 */
export const ANALYZER_VERSION = 1;

/**
 * 1 when the answer opens with the subject, falling toward 0 the later it
 * first appears; null when it isn't mentioned.
 */
export function prominence(position: number | null): number | null {
	return position === null ? null : 1 - position;
}

/**
 * Within one run, rank the mentioned subjects by where each first appears.
 * Subjects first named at the same offset ("Notion" inside "Notion AI") share a
 * rank and the next one skips past them (1, 1, 3). Unmentioned subjects get no
 * rank.
 */
export function rankSubjects<K>(subjects: ReadonlyArray<{ key: K; first: number | null }>): Map<K, number> {
	const mentioned = subjects
		.filter((subject): subject is { key: K; first: number } => subject.first !== null)
		.sort((a, b) => a.first - b.first);
	const ranks = new Map<K, number>();
	let rank = 0;
	mentioned.forEach((subject, index) => {
		if (index === 0 || subject.first !== mentioned[index - 1].first) rank = index + 1;
		ranks.set(subject.key, rank);
	});
	return ranks;
}
