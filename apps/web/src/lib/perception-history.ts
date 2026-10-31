/**
 * The history surface's arithmetic, kept free of server code so the page, its stories and its tests share
 * it. Inputs are rollup rows (`server/perception-history-core.ts`); each series gets one honest number per
 * day or none.
 */

/** Below this many answers a day has no point (SPEC §11.4, rule 2). */
export const MIN_DAY_ANSWERS = 10;

export interface Tally {
	answers: number;
}

/**
 * One version of the judge, or one competitor set, per day. A day can hold two when some answers were
 * judged again after a version change (or ranked under a different set). The day uses the one that
 * covers the most answers, the newer one on a tie (`newer` says which), so a point is one reading of one set of answers:
 * never a sum across versions, which double-counts, and never a mix. What was left out is reported, so
 * a partly re-judged day says so.
 */
export function pickDominant<T extends Tally>(
	options: Map<string, T>,
	newer: (a: string, b: string) => boolean = (a, b) => a > b,
): { key: string; chosen: T; otherAnswers: number } | null {
	let best: { key: string; chosen: T } | null = null;
	let total = 0;
	for (const [key, value] of options) {
		total += value.answers;
		if (!best || value.answers > best.chosen.answers || (value.answers === best.chosen.answers && newer(key, best.key)))
			best = { key, chosen: value };
	}
	return best && { ...best, otherAnswers: total - best.chosen.answers };
}

/** Each calendar day from `first` to `last`, inclusive, as YYYY-MM-DD. */
export function daysBetween(first: string, last: string): string[] {
	const days: string[] = [];
	for (let t = Date.parse(`${first}T00:00:00Z`); t <= Date.parse(`${last}T00:00:00Z`); t += 86_400_000)
		days.push(new Date(t).toISOString().slice(0, 10));
	return days;
}

export interface DayPoint {
	day: string;
	answers: number;
}

/**
 * A line over every calendar day from the first day with data to the last: a value where the day has
 * enough answers, null (a gap) where it has too few or none. Nothing is drawn before the first day.
 */
export function lineOverDays<P extends DayPoint>(
	points: P[],
	value: (point: P) => number | null,
	minAnswers = MIN_DAY_ANSWERS,
): { days: string[]; values: (number | null)[]; hiddenDays: number } {
	if (points.length === 0) return { days: [], values: [], hiddenDays: 0 };
	const byDay = new Map(points.map((point) => [point.day, point]));
	const days = daysBetween(points[0].day, points[points.length - 1].day);
	let hiddenDays = 0;
	const values = days.map((day) => {
		const point = byDay.get(day);
		if (!point) return null;
		if (point.answers < minAnswers) {
			hiddenDays++;
			return null;
		}
		return value(point);
	});
	return { days, values, hiddenDays };
}

/** A real judge's stamp is newer than the stub's, which only ever stands in until a key is set; otherwise the later string. */
export const newerJudgeStamp = (a: string, b: string): boolean => {
	const stub = (stamp: string) => stamp.includes("+stub+");
	return stub(a) !== stub(b) ? stub(b) : a > b;
};
