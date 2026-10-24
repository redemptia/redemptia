/**
 * The perception job: finds fact-prompt runs with facts not yet judged at the current stamp, extracts
 * each run's text itself from `raw_output` (so it doesn't depend on elmo's judge having succeeded),
 * asks Jev every missing fact in one call per answer, and writes the verdicts.
 *
 * Paid work is guarded three ways: a call is made only after the organization's daily ceiling has a
 * slot for it, a verdict's unique key makes a re-sent judgement fail rather than be stored twice, and
 * a run that can't produce a verdict is recorded so no later scan pays for it again.
 */
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { brands, promptRuns, prompts } from "@workspace/lib/db/schema";
import {
	brandFacts,
	type PerceptionRunOutcome,
	perceptionBrandSettings,
	perceptionPrompts,
	perceptionRollupDirty,
	perceptionRunStatus,
	perceptionVerdicts,
} from "@workspace/lib/db/schema-perception";
import { EXTRACTOR_VERSION, extractorFor, extractRun } from "@workspace/lib/text-extraction";
import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import {
	JEV_MODEL,
	type JevRequest,
	type JevResponse,
	type JevTransport,
	RateLimited,
	TooLarge,
} from "../mention-judge/jev";
import { reserveJevCall } from "./budget";
import {
	type EvidenceSubject,
	evidencePassages,
	factEvidenceKey,
	factEvidenceQuestion,
	factKey,
	factQuestion,
	NO_PASSAGE,
} from "./fact-questions";

/** Bumped whenever the questions or how answers are read change, which re-judges everything. */
export const PERCEPTION_VERSION = 2;
/** The judge sees at most this much of an answer, from its beginning. */
export const MAX_ANSWER_CHARS = 20_000;
/** Shortening on "too large" stops here; below it the run is recorded as too large. */
export const MIN_ANSWER_CHARS = 2_000;
/** Runs older than this aren't judged: a new fact or stamp doesn't re-judge all history. */
export const LOOKBACK_DAYS = 30;
/** Failed calls for one run before it is set aside. */
export const MAX_ATTEMPTS = 3;
/** Runs per job: the scan is cheap, the calls are what take the time. */
export const RUNS_PER_JOB = 25;

/** Stub judgements are stamped as the stub's, so a real key re-judges what the stub judged. */
export function perceptionStamp(judge: string): string {
	return `perception-${PERCEPTION_VERSION}+${judge}+extractor-${EXTRACTOR_VERSION}`;
}

export interface JudgeOutcome {
	runs: number;
	calls: number;
	verdicts: number;
	/** The ceiling turned a call away; the job stops for the day and says so. */
	overCeiling: boolean;
	/** Jev rate-limited a call; the job stops and the next one tries again. */
	rateLimited: boolean;
}

interface PendingRun {
	runId: string;
	brandId: string;
	organizationId: string;
	subject: string;
	/** The subject's names and domains, which decide the passages the judge may quote. */
	names: EvidenceSubject;
	prompt: string;
	model: string;
	provider: string | null;
	rawOutput: unknown;
	day: string;
	attempts: number;
	facts: { id: string; statement: string }[];
}

/**
 * Fact-prompt runs of brands with perception on, from the last `LOOKBACK_DAYS`, with at least one fact, valid on the run's UTC day,
 * that has no verdict at `stamp`, newest first, skipping runs already set aside at this stamp.
 */
async function pendingRuns(db: DbConnection, stamp: string, limit: number): Promise<PendingRun[]> {
	const runDay = sql<string>`(${promptRuns.createdAt} AT TIME ZONE 'UTC')::date`;
	const rows = await db
		.select({
			runId: promptRuns.id,
			brandId: promptRuns.brandId,
			organizationId: brands.organizationId,
			subject: brands.name,
			aliases: brands.aliases,
			website: brands.website,
			additionalDomains: brands.additionalDomains,
			prompt: prompts.value,
			model: promptRuns.model,
			provider: promptRuns.provider,
			day: sql<string>`${runDay}::text`,
			attempts: sql<number>`coalesce(${perceptionRunStatus.attempts}, 0)`,
			factId: brandFacts.id,
			statement: brandFacts.statement,
		})
		.from(promptRuns)
		.innerJoin(
			perceptionPrompts,
			and(eq(perceptionPrompts.promptId, promptRuns.promptId), eq(perceptionPrompts.class, "fact")),
		)
		.innerJoin(prompts, eq(prompts.id, promptRuns.promptId))
		.innerJoin(brands, eq(brands.id, promptRuns.brandId))
		// A brand with perception off is never judged, so turning it off stops the spend.
		.innerJoin(
			perceptionBrandSettings,
			and(eq(perceptionBrandSettings.brandId, promptRuns.brandId), eq(perceptionBrandSettings.enabled, true)),
		)
		.innerJoin(
			brandFacts,
			and(
				eq(brandFacts.brandId, promptRuns.brandId),
				lte(brandFacts.validFrom, runDay),
				or(isNull(brandFacts.validTo), gte(brandFacts.validTo, runDay)),
			),
		)
		.leftJoin(
			perceptionRunStatus,
			and(eq(perceptionRunStatus.runId, promptRuns.id), eq(perceptionRunStatus.stamp, stamp)),
		)
		.where(
			and(
				gte(promptRuns.createdAt, sql`now() - make_interval(days => ${LOOKBACK_DAYS})`),
				isNull(perceptionRunStatus.outcome),
				sql`NOT EXISTS (SELECT 1 FROM ${perceptionVerdicts} WHERE ${perceptionVerdicts.runId} = ${promptRuns.id}
					AND ${perceptionVerdicts.factId} = ${brandFacts.id} AND ${perceptionVerdicts.stamp} = ${stamp})`,
			),
		)
		.orderBy(desc(promptRuns.createdAt), promptRuns.id, brandFacts.id);

	const byRun = new Map<string, PendingRun>();
	for (const row of rows) {
		let run = byRun.get(row.runId);
		if (!run) {
			if (byRun.size === limit) break;
			const { aliases, website, additionalDomains, ...rest } = row;
			run = {
				...rest,
				names: { name: row.subject, aliases: aliases ?? [], domains: [website, ...(additionalDomains ?? [])] },
				rawOutput: null,
				attempts: Number(row.attempts),
				facts: [],
			};
			byRun.set(row.runId, run);
		}
		run.facts.push({ id: row.factId, statement: row.statement });
	}
	// raw_output is read only for the runs being judged, not for every candidate row.
	for (const run of byRun.values()) {
		const [raw] = await db
			.select({ rawOutput: promptRuns.rawOutput })
			.from(promptRuns)
			.where(eq(promptRuns.id, run.runId));
		run.rawOutput = raw?.rawOutput ?? null;
	}
	return [...byRun.values()];
}

async function setAside(
	db: DbConnection,
	runId: string,
	stamp: string,
	outcome: PerceptionRunOutcome | null,
	attempts: number,
	error?: string,
) {
	await db
		.insert(perceptionRunStatus)
		.values({ runId, stamp, outcome, attempts, lastError: error ?? null })
		.onConflictDoUpdate({
			target: perceptionRunStatus.runId,
			set: { stamp, outcome, attempts, lastError: error ?? null, updatedAt: sql`now()` },
		});
}

/** Questions over the answer as the judge will see it, and the passages its evidence questions offer. */
type Questions = { questions: JevRequest["questions"]; passages: string[] };

type Asked =
	| { kind: "answered"; response: JevResponse; truncatedAt: number | null; calls: number; passages: string[] }
	| { kind: "over_ceiling"; calls: number }
	| { kind: "too_large"; calls: number };

/** The first `length` UTF-16 units, one fewer when that would split an emoji into half a pair. */
function cut(text: string, length: number): string {
	const code = text.charCodeAt(length - 1);
	return text.slice(0, code >= 0xd800 && code <= 0xdbff ? length - 1 : length);
}

/**
 * Asks every question over the answer, cut to `MAX_ANSWER_CHARS`. When the judge finds the request too
 * large, the answer is halved, keeping its beginning, and asked again with every question: dropping
 * questions would make an unasked fact look like one the answer never mentions.
 */
async function ask(
	db: DbConnection,
	transport: JevTransport,
	run: PendingRun,
	text: string,
	questionsFor: (judged: string) => Questions,
): Promise<Asked> {
	let length = Math.min(text.length, MAX_ANSWER_CHARS);
	let calls = 0;
	for (;;) {
		if (!(await reserveJevCall(db, run.organizationId))) return { kind: "over_ceiling", calls };
		calls++;
		const judged = cut(text, length);
		// Rebuilt at every length, so no passage is offered from text the judge wasn't shown.
		const { questions, passages } = questionsFor(judged);
		const request: JevRequest = { model: JEV_MODEL, state: { question: run.prompt, answer: judged }, questions };
		try {
			const response = await transport(request);
			return { kind: "answered", response, truncatedAt: length < text.length ? length : null, calls, passages };
		} catch (error) {
			if (!(error instanceof TooLarge)) throw Object.assign(error as Error, { calls });
			if (length <= MIN_ANSWER_CHARS) return { kind: "too_large", calls };
			length = Math.max(MIN_ANSWER_CHARS, Math.floor(length / 2));
		}
	}
}

/** A failed attempt; the run is set aside for good once it has failed `MAX_ATTEMPTS` times. */
async function failed(db: DbConnection, run: PendingRun, stamp: string, error: string) {
	const attempts = run.attempts + 1;
	await setAside(db, run.runId, stamp, attempts >= MAX_ATTEMPTS ? "failed" : null, attempts, error.slice(0, 500));
}

/** What the judge returns beyond our client's types: its model, and each answer's confidence. */
type JudgedResponse = JevResponse & {
	model?: string;
	answers: Record<string, { choice: string; probabilities: Record<string, number>; confidence?: number }>;
};

async function record(
	db: DbConnection,
	run: PendingRun,
	stamp: string,
	response: JudgedResponse,
	truncatedAt: number | null,
	passages: string[],
) {
	const rows = run.facts.map((fact) => {
		const answer = response.answers[factKey(fact.id)];
		const evidence = response.answers[factEvidenceKey(fact.id)];
		const picked =
			evidence && evidence.choice !== NO_PASSAGE ? passages[Number(evidence.choice.slice(1)) - 1] : undefined;
		return {
			runId: run.runId,
			subject: run.subject,
			kind: "fact" as const,
			factId: fact.id,
			verdict: answer.choice,
			probabilities: answer.probabilities,
			confidence: typeof answer.confidence === "number" ? answer.confidence : null,
			passage: picked ?? null,
			passageConfidence: typeof evidence?.confidence === "number" ? evidence.confidence : null,
			stamp,
			truncatedAt,
		};
	});
	return db.transaction(async (tx) => {
		// A re-sent judgement of the same question at the same stamp is already stored.
		const written = await tx
			.insert(perceptionVerdicts)
			.values(rows)
			.onConflictDoNothing()
			.returning({ id: perceptionVerdicts.id });
		await tx.insert(perceptionRollupDirty).values({ brandId: run.brandId, day: run.day }).onConflictDoNothing();
		await tx.delete(perceptionRunStatus).where(eq(perceptionRunStatus.runId, run.runId));
		return written.length;
	});
}

type RunResult = { calls: number; verdicts: number; stop?: "over_ceiling" | "rate_limited" };

/** Judges one run's missing facts in one call, and records what came of it. */
async function judgeRun(
	db: DbConnection,
	transport: JevTransport,
	run: PendingRun,
	stamp: string,
	judge: string,
): Promise<RunResult> {
	const text = extractRun(run.rawOutput, extractorFor({ provider: run.provider, model: run.model })).textContent;
	if (!text) {
		await setAside(db, run.runId, stamp, "no_text", run.attempts);
		return { calls: 0, verdicts: 0 };
	}
	const questionsFor = (judged: string): Questions => {
		const passages = evidencePassages(judged, run.names);
		// With no sentence naming the subject there is nothing to offer, and no evidence question is asked.
		const questions = Object.fromEntries(
			run.facts.flatMap((fact) => [
				[factKey(fact.id), factQuestion(run.subject, fact.statement)],
				...(passages.length > 0
					? [[factEvidenceKey(fact.id), factEvidenceQuestion(run.subject, fact.statement, passages)]]
					: []),
			]),
		);
		return { questions, passages };
	};
	let asked: Asked;
	try {
		asked = await ask(db, transport, run, text, questionsFor);
	} catch (error) {
		const calls = (error as { calls?: number }).calls ?? 0;
		// A rate limit says nothing about the run, so it doesn't count as one of its attempts.
		if (error instanceof RateLimited) return { calls, verdicts: 0, stop: "rate_limited" };
		await failed(db, run, stamp, String(error));
		return { calls, verdicts: 0 };
	}
	if (asked.kind === "over_ceiling") return { calls: asked.calls, verdicts: 0, stop: "over_ceiling" };
	if (asked.kind === "too_large") {
		await setAside(db, run.runId, stamp, "too_large", run.attempts);
		return { calls: asked.calls, verdicts: 0 };
	}
	const response = asked.response as JudgedResponse;
	// A judge answering as a different version would mix two judges' verdicts under one stamp.
	if (judge !== "stub" && response.model !== judge) {
		await failed(db, run, stamp, `Jev answered as ${response.model ?? "an unnamed model"}, not ${judge}`);
		return { calls: asked.calls, verdicts: 0 };
	}
	const asks = asked.passages.length > 0;
	const unanswered = run.facts.find(
		(fact) => !response.answers[factKey(fact.id)] || (asks && !response.answers[factEvidenceKey(fact.id)]),
	);
	if (unanswered) {
		await failed(db, run, stamp, `no answer for ${unanswered.id}`);
		return { calls: asked.calls, verdicts: 0 };
	}
	return { calls: asked.calls, verdicts: await record(db, run, stamp, response, asked.truncatedAt, asked.passages) };
}

/** One job's worth of judging. `judge` names the transport for the stamp: the Jev model, or "stub". */
export async function judgePendingRuns(
	db: DbConnection,
	transport: JevTransport,
	judge: string,
	limit = RUNS_PER_JOB,
): Promise<JudgeOutcome> {
	const stamp = perceptionStamp(judge);
	const outcome: JudgeOutcome = { runs: 0, calls: 0, verdicts: 0, overCeiling: false, rateLimited: false };
	for (const run of await pendingRuns(db, stamp, limit)) {
		const result = await judgeRun(db, transport, run, stamp, judge);
		outcome.calls += result.calls;
		outcome.verdicts += result.verdicts;
		if (result.verdicts > 0) outcome.runs++;
		if (result.stop === "over_ceiling") outcome.overCeiling = true;
		if (result.stop === "rate_limited") outcome.rateLimited = true;
		if (result.stop) break;
	}
	return outcome;
}
