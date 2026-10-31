import type { DbConnection } from "@workspace/lib/db/db-connection";
import { brands, promptRuns, runMentions } from "@workspace/lib/db/schema";
import { perceptionPrompts, rollupProminenceDaily } from "@workspace/lib/db/schema-perception";
import type { MentionAssessment, RunMentionAssessments } from "@workspace/lib/mentions";
import { competitorSetFingerprint } from "@workspace/lib/perception/competitor-set";
import { and, eq, isNotNull, sql } from "drizzle-orm";

/** How far back elmo's reprocess can rewrite a judged answer's mentions, and so its positions. */
export const PROMINENCE_WINDOW_DAYS = 90;

const dayOf = (date: Date) => date.toISOString().slice(0, 10);
const daysBefore = (date: Date, days: number) => dayOf(new Date(date.getTime() - days * 86_400_000));

let lastFullPass: string | null = null;

export interface ProminenceRollupOutcome {
	days: number;
	rows: number;
}

/**
 * Rebuilds `rollup_prominence_daily` from `run_mentions`, a (brand, UTC day) at a time. Market answers
 * get no dirty marker (elmo's judge writes their mentions, and nothing of ours runs then), so the days
 * to rebuild are found another way: today and yesterday on every job, any day in the window with
 * market answers and no rollup yet, and the whole window once a UTC day, since a reprocess after a
 * competitor change rewrites positions up to `PROMINENCE_WINDOW_DAYS` back. Market volume is a few
 * dozen answers a day per brand, so that is cheap. A day is replaced whole in one transaction, so
 * rebuilding it gives the same rows.
 */
export async function buildProminenceRollups(
	db: DbConnection,
	now = new Date(),
	options: { fullPass?: boolean } = {},
): Promise<ProminenceRollupOutcome> {
	const today = dayOf(now);
	const full = options.fullPass ?? lastFullPass !== today;
	const day = sql<string>`(${promptRuns.createdAt} AT TIME ZONE 'UTC')::date`;
	const candidates = await db
		.selectDistinct({ brandId: promptRuns.brandId, day })
		.from(promptRuns)
		.innerJoin(
			perceptionPrompts,
			and(eq(perceptionPrompts.promptId, promptRuns.promptId), eq(perceptionPrompts.class, "market")),
		)
		.innerJoin(runMentions, eq(runMentions.runId, promptRuns.id))
		.where(
			and(
				isNotNull(runMentions.assessments),
				sql`${day} >= ${daysBefore(now, PROMINENCE_WINDOW_DAYS)}::date`,
				full
					? sql`true`
					: sql`(${day} >= ${daysBefore(now, 1)}::date OR NOT EXISTS (
						SELECT 1 FROM rollup_prominence_daily p WHERE p.brand_id = ${promptRuns.brandId} AND p.day = ${day}))`,
			),
		);
	const outcome: ProminenceRollupOutcome = { days: 0, rows: 0 };
	for (const candidate of candidates) {
		outcome.rows += await rebuildDay(db, candidate.brandId, candidate.day);
		outcome.days++;
	}
	if (options.fullPass === undefined && full) lastFullPass = today;
	return outcome;
}

interface Totals {
	answers: number;
	mentioned: number;
	positioned: number;
	positionSum: number;
	inverseSum: number;
}

interface Key {
	brandId: string;
	day: string;
	promptId: string;
	attributeKey: string;
	model: string;
	provider: string;
	subjectName: string;
	competitorSetFingerprint: string;
}

interface MarketRun {
	promptId: string;
	attributeKey: string | null;
	model: string;
	provider: string | null;
	assessments: RunMentionAssessments | null;
}

type Group = Totals & { key: Key };

function tally(group: Group, record: MentionAssessment | undefined) {
	group.answers++;
	if (!record?.mentioned) return;
	group.mentioned++;
	if (!record.position) return;
	group.positioned++;
	group.positionSum += record.position;
	group.inverseSum += 1 / record.position;
}

/** One answer counts once for the brand and once for each competitor in the set it was judged against. */
function addRun(groups: Map<string, Group>, run: MarketRun, brandId: string, brandName: string, day: string) {
	const { assessments, attributeKey } = run;
	if (!assessments || !attributeKey) return;
	const names = Object.keys(assessments.judged.competitors).sort();
	const fingerprint = competitorSetFingerprint(names);
	const subjects: [string, MentionAssessment | undefined][] = [
		[brandName, assessments.brand],
		...names.map((name): [string, MentionAssessment | undefined] => [name, assessments.competitors[name]]),
	];
	for (const [subject, record] of subjects) {
		const id = [run.promptId, run.model, run.provider ?? "", subject, fingerprint].join("\u0000");
		let group = groups.get(id);
		if (!group) {
			const key = {
				brandId,
				day,
				promptId: run.promptId,
				attributeKey,
				model: run.model,
				provider: run.provider ?? "",
				subjectName: subject,
				competitorSetFingerprint: fingerprint,
			};
			group = { answers: 0, mentioned: 0, positioned: 0, positionSum: 0, inverseSum: 0, key };
			groups.set(id, group);
		}
		tally(group, record);
	}
}

async function rebuildDay(db: DbConnection, brandId: string, day: string): Promise<number> {
	return db.transaction(async (tx) => {
		const [brand] = await tx.select({ name: brands.name }).from(brands).where(eq(brands.id, brandId));
		const runs = await tx
			.select({
				promptId: promptRuns.promptId,
				attributeKey: perceptionPrompts.attributeKey,
				model: promptRuns.model,
				provider: promptRuns.provider,
				assessments: runMentions.assessments,
			})
			.from(promptRuns)
			.innerJoin(
				perceptionPrompts,
				and(eq(perceptionPrompts.promptId, promptRuns.promptId), eq(perceptionPrompts.class, "market")),
			)
			.innerJoin(runMentions, eq(runMentions.runId, promptRuns.id))
			.where(
				and(
					eq(promptRuns.brandId, brandId),
					isNotNull(runMentions.assessments),
					sql`(${promptRuns.createdAt} AT TIME ZONE 'UTC')::date = ${day}::date`,
				),
			);
		const groups = new Map<string, Group>();
		for (const run of runs) addRun(groups, run, brandId, brand?.name ?? "", day);

		await tx
			.delete(rollupProminenceDaily)
			.where(and(eq(rollupProminenceDaily.brandId, brandId), sql`${rollupProminenceDaily.day} = ${day}::date`));
		const rows = [...groups.values()].map((group) => ({
			...group.key,
			answers: group.answers,
			mentionedAnswers: group.mentioned,
			positionedAnswers: group.positioned,
			positionSum: group.positionSum,
			inversePositionSum: group.inverseSum,
		}));
		if (rows.length > 0) await tx.insert(rollupProminenceDaily).values(rows);
		return rows.length;
	});
}
