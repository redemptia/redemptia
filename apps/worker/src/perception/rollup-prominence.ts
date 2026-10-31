import type { DbConnection } from "@workspace/lib/db/db-connection";
import { brands, promptRuns, runMentions } from "@workspace/lib/db/schema";
import {
	perceptionProminenceDirty,
	perceptionPrompts,
	rollupProminenceDaily,
} from "@workspace/lib/db/schema-perception";
import type { MentionAssessment, RunMentionAssessments } from "@workspace/lib/mentions";
import { competitorSetFingerprint } from "@workspace/lib/perception/competitor-set";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";

/** How far back elmo's reprocess can rewrite a judged answer's mentions, and so its positions. */
export const PROMINENCE_WINDOW_DAYS = 90;
/** Days rebuilt per job: a backlog clears over several runs rather than in one long one. */
export const PROMINENCE_DAYS_PER_JOB = 200;
const WEEK_MS = 7 * 86_400_000;

const dayOf = (date: Date) => date.toISOString().slice(0, 10);
const daysBefore = (date: Date, days: number) => dayOf(new Date(date.getTime() - days * 86_400_000));

let lastFullPass: number | null = null;

export interface ProminenceRollupOutcome {
	days: number;
	rows: number;
}

/**
 * Rebuilds `rollup_prominence_daily` from `run_mentions`, a (brand, UTC day) at a time, for the days a
 * trigger on `run_mentions` marked: a market answer whose mentions are written or rewritten, by the
 * judge, a replay or a backfill, marks its day. A day is replaced whole in one transaction with clearing
 * the marker it was read under, so rebuilding it gives the same rows and a mention written mid-rebuild
 * keeps its marker.
 *
 * `brandId` limits a pass to one brand. A pass over the whole `PROMINENCE_WINDOW_DAYS` window runs about once a week, as a safety net for what
 * a trigger can't see: market answers deleted, a prompt relabelled, an attribute renamed, a brand renamed
 * (its rows are keyed by name), or markers lost in a restore.
 */
export async function buildProminenceRollups(
	db: DbConnection,
	now = new Date(),
	options: { fullPass?: boolean; brandId?: string } = {},
): Promise<ProminenceRollupOutcome> {
	const week = Math.floor(now.getTime() / WEEK_MS);
	const full = options.fullPass ?? lastFullPass !== week;
	const marked = await db
		.select({
			brandId: perceptionProminenceDirty.brandId,
			day: sql<string>`${perceptionProminenceDirty.day}::text`,
			// As text, to keep the microseconds a Date would drop.
			markedAt: sql<string>`${perceptionProminenceDirty.markedAt}::text`,
		})
		.from(perceptionProminenceDirty)
		.where(options.brandId ? eq(perceptionProminenceDirty.brandId, options.brandId) : undefined)
		.orderBy(asc(perceptionProminenceDirty.day), asc(perceptionProminenceDirty.brandId))
		.limit(PROMINENCE_DAYS_PER_JOB);
	const days = new Map<string, { brandId: string; day: string; markedAt: string | null }>();
	for (const row of marked) days.set(`${row.brandId} ${row.day}`, row);
	if (full) {
		const day = sql<string>`(${promptRuns.createdAt} AT TIME ZONE 'UTC')::date`;
		const everything = await db
			.selectDistinct({ brandId: promptRuns.brandId, day: sql<string>`${day}::text` })
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
					options.brandId ? eq(promptRuns.brandId, options.brandId) : undefined,
				),
			);
		for (const row of everything) {
			const key = `${row.brandId} ${row.day}`;
			if (!days.has(key)) days.set(key, { ...row, markedAt: null });
		}
	}
	const outcome: ProminenceRollupOutcome = { days: 0, rows: 0 };
	for (const { brandId, day, markedAt } of days.values()) {
		outcome.rows += await rebuildDay(db, brandId, day, markedAt);
		outcome.days++;
	}
	if (options.fullPass === undefined && full) lastFullPass = week;
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

async function rebuildDay(db: DbConnection, brandId: string, day: string, markedAt: string | null): Promise<number> {
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
		if (markedAt !== null)
			await tx
				.delete(perceptionProminenceDirty)
				.where(
					and(
						eq(perceptionProminenceDirty.brandId, brandId),
						sql`${perceptionProminenceDirty.day} = ${day}::date`,
						sql`${perceptionProminenceDirty.markedAt} = ${markedAt}::timestamptz`,
					),
				);
		return rows.length;
	});
}
