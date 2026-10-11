/**
 * Pure, IO-free scoring of where an answer mentions each subject.
 *
 * Only a mention's first offset and position (from `locateSubject`) are ever
 * persisted. Prominence and rank are always computed on read from those, so
 * changing how either is defined needs no backfill.
 */

/**
 * Bump on a code change to `needleFor`, `normalizeDomain` or `locateSubject`
 * that would give a different first offset or position for the same text and
 * subject. Stored rows from an older version are stale and must be re-analysed.
 *
 * It covers code only. Editing a subject's names, aliases or domains, or
 * re-extracting the answer text (`run_texts.extractor_version`), also makes
 * stored rows stale without a bump, so persistence needs its own signal for
 * those.
 */
export const ANALYZER_VERSION = 1;

/**
 * 1 when the answer opens with the subject, falling linearly toward 0 the
 * later it first appears (0.5 means halfway through); null when it isn't
 * mentioned.
 */
export function prominence(position: number | null): number | null {
	return position === null ? null : 1 - position;
}

/**
 * Within one run, rank the mentioned subjects by where each first appears.
 * Subjects first named at the same offset ("Notion" inside "Notion AI") share a
 * rank and the next one skips past them (1, 1, 3). Unmentioned subjects get no
 * rank. Keys must be unique within the run.
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
