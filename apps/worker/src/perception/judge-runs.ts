/**
 * The perception job: finds fact-prompt runs with facts not yet judged at the current stamp, and
 * association-prompt runs not yet judged at it, extracts each run's text itself from `raw_output` (so
 * it doesn't depend on elmo's judge having succeeded), asks Jev every question in one call per answer,
 * and writes the verdicts.
 *
 * An association answer is judged once, against the attributes active when it is judged: a new
 * attribute or question applies to answers judged after it, and only a new stamp re-judges the window.
 * So the drift question's "none of these" is exactly the attribute verdicts stored on the same run.
 *
 * Paid work is guarded three ways: a call is made only after the organization's daily ceiling has a
 * slot for it, a verdict's unique key makes a re-sent judgement fail rather than be stored twice, and
 * a run that can't produce a verdict is recorded so no later scan pays for it again.
 */
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { brands, competitors, promptRuns, prompts } from "@workspace/lib/db/schema";
import {
	brandFacts,
	type PerceptionRunOutcome,
	perceptionAttributes,
	perceptionBrandSettings,
	perceptionPrompts,
	perceptionRollupDirty,
	perceptionRunStatus,
	perceptionVerdicts,
} from "@workspace/lib/db/schema-perception";
import { ASSOCIATION_ENABLED } from "@workspace/lib/perception/association";
import { DAILY_JEV_CALL_CEILING } from "@workspace/lib/perception/limits";
import { EXTRACTOR_VERSION, extractorFor, extractRun } from "@workspace/lib/text-extraction";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
	JEV_MODEL,
	type JevRequest,
	type JevResponse,
	type JevTransport,
	RateLimited,
	TooLarge,
} from "../mention-judge/jev";
import {
	attributeJudgeQuestion,
	attributeKey,
	DRIFT_EVIDENCE_KEY,
	DRIFT_KEY,
	driftEvidenceQuestion,
	driftQuestion,
} from "./association-questions";
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
	/** The ceiling turned a call away part-way through a job; that organization is skipped for the rest of it. */
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
	/** A fact prompt's run asks the facts; an association prompt's run asks the attributes and drift. */
	facts: { id: string; statement: string; sourceUrl: string | null }[];
	attributes: { id: string; questionText: string; questionVersion: number }[];
}

/**
 * An organization that has used today's calls has no slot left, so its runs stay out of the batch:
 * otherwise they would fill it every minute and hold back every organization still under its ceiling.
 */
const hasCallsLeft = sql`NOT EXISTS (
	SELECT 1 FROM perception_jev_calls c
	WHERE c.organization_id = ${brands.organizationId} AND c.day = (now() AT TIME ZONE 'UTC')::date
		AND c.calls >= ${DAILY_JEV_CALL_CEILING})`;

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
			sourceUrl: brandFacts.sourceUrl,
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
				hasCallsLeft,
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
				attributes: [],
			};
			byRun.set(row.runId, run);
		}
		run.facts.push({ id: row.factId, statement: row.statement, sourceUrl: row.sourceUrl });
	}
	return withRawOutput(db, [...byRun.values()]);
}

/** Tracked competitors whose names contain the subject's own name or an alias: "Acme Cloud" for "Acme". */
function lookalikesOf(subject: EvidenceSubject, competitorNames: string[]): string[] {
	const terms = [subject.name, ...subject.aliases].map((term) => term.trim().toLowerCase()).filter(Boolean);
	return competitorNames.filter((name) => {
		const lower = name.trim().toLowerCase();
		return terms.some((term) => lower !== term && lower.includes(term));
	});
}

/**
 * raw_output is read only for the runs being judged, not for every candidate row. Each run also learns
 * which of its brand's competitors have names containing the brand's, so a sentence about "Acme Cloud"
 * is never taken for one about "Acme".
 */
async function withRawOutput(db: DbConnection, runs: PendingRun[]): Promise<PendingRun[]> {
	const brandIds = [...new Set(runs.map((run) => run.brandId))];
	const tracked =
		brandIds.length === 0
			? []
			: await db
					.select({ brandId: competitors.brandId, name: competitors.name, aliases: competitors.aliases })
					.from(competitors)
					.where(inArray(competitors.brandId, brandIds));
	for (const run of runs) {
		const [raw] = await db
			.select({ rawOutput: promptRuns.rawOutput })
			.from(promptRuns)
			.where(eq(promptRuns.id, run.runId));
		run.rawOutput = raw?.rawOutput ?? null;
		const names = tracked.filter((c) => c.brandId === run.brandId).flatMap((c) => [c.name, ...(c.aliases ?? [])]);
		run.names = { ...run.names, lookalikes: lookalikesOf(run.names, names) };
	}
	return runs;
}

/**
 * Association-prompt runs of brands with perception on and at least one active attribute, from the
 * last `LOOKBACK_DAYS`, with no verdict at `stamp` yet, newest first, skipping runs set aside at it.
 * Each carries the brand's active attributes as they stand now.
 */
async function pendingAssociationRuns(db: DbConnection, stamp: string, limit: number): Promise<PendingRun[]> {
	if (limit <= 0) return [];
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
			day: sql<string>`((${promptRuns.createdAt} AT TIME ZONE 'UTC')::date)::text`,
			attempts: sql<number>`coalesce(${perceptionRunStatus.attempts}, 0)`,
		})
		.from(promptRuns)
		.innerJoin(
			perceptionPrompts,
			and(eq(perceptionPrompts.promptId, promptRuns.promptId), eq(perceptionPrompts.class, "association")),
		)
		.innerJoin(prompts, eq(prompts.id, promptRuns.promptId))
		.innerJoin(brands, eq(brands.id, promptRuns.brandId))
		.innerJoin(
			perceptionBrandSettings,
			and(eq(perceptionBrandSettings.brandId, promptRuns.brandId), eq(perceptionBrandSettings.enabled, true)),
		)
		.leftJoin(
			perceptionRunStatus,
			and(eq(perceptionRunStatus.runId, promptRuns.id), eq(perceptionRunStatus.stamp, stamp)),
		)
		.where(
			and(
				gte(promptRuns.createdAt, sql`now() - make_interval(days => ${LOOKBACK_DAYS})`),
				isNull(perceptionRunStatus.outcome),
				hasCallsLeft,
				sql`EXISTS (SELECT 1 FROM ${perceptionAttributes} WHERE ${perceptionAttributes.brandId} = ${promptRuns.brandId}
					AND ${perceptionAttributes.retiredAt} IS NULL)`,
				sql`NOT EXISTS (SELECT 1 FROM ${perceptionVerdicts} WHERE ${perceptionVerdicts.runId} = ${promptRuns.id}
					AND ${perceptionVerdicts.stamp} = ${stamp})`,
			),
		)
		.orderBy(desc(promptRuns.createdAt), promptRuns.id)
		.limit(limit);
	if (rows.length === 0) return [];
	const attributes = await db
		.select({
			brandId: perceptionAttributes.brandId,
			id: perceptionAttributes.id,
			questionText: perceptionAttributes.questionText,
			questionVersion: perceptionAttributes.questionVersion,
		})
		.from(perceptionAttributes)
		.where(
			and(
				inArray(perceptionAttributes.brandId, [...new Set(rows.map((row) => row.brandId))]),
				isNull(perceptionAttributes.retiredAt),
			),
		)
		.orderBy(asc(perceptionAttributes.createdAt), asc(perceptionAttributes.id));
	return withRawOutput(
		db,
		rows.map(({ aliases, website, additionalDomains, ...row }) => ({
			...row,
			names: { name: row.subject, aliases: aliases ?? [], domains: [website, ...(additionalDomains ?? [])] },
			rawOutput: null,
			attempts: Number(row.attempts),
			facts: [],
			attributes: attributes
				.filter((attribute) => attribute.brandId === row.brandId)
				.map(({ brandId: _, ...attribute }) => attribute),
		})),
	);
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

/** A page as a URL names it: no scheme, "www.", query, fragment or trailing slash, any case. */
const pageKey = (url: string) =>
	url
		.replace(/^https?:\/\/(www\.)?/, "")
		.replace(/[?#].*$/, "")
		.replace(/\/+$/, "")
		.toLowerCase();

const siteHost = (domain: string) =>
	domain
		.replace(/^https?:\/\/(www\.)?/, "")
		.replace(/\/.*$/, "")
		.toLowerCase();

/**
 * What an answer cited, kept on each fact verdict: any source, the brand's own site, and the fact's
 * source page. Worked out from the stored answer when it is judged, so a readout counts them instead
 * of reading every citation.
 */
export function grounding(
	citations: { url: string; domain: string }[],
	siteDomains: string[],
	sourceUrl: string | null,
) {
	const hosts = siteDomains.map(siteHost).filter(Boolean);
	const onSite = (domain: string) => {
		const lower = domain.toLowerCase();
		return hosts.some((host) => lower.replace(/^www\./, "") === host || lower.endsWith(`.${host}`));
	};
	const source = sourceUrl ? pageKey(sourceUrl) : null;
	return {
		cited: citations.length > 0,
		citedSite: citations.some((citation) => onSite(citation.domain)),
		citedSource: source !== null && citations.some((citation) => pageKey(citation.url) === source),
	};
}

/** The verdict rows an answer's judgement makes, for whichever class of prompt the run is. */
function verdictRows(
	run: PendingRun,
	stamp: string,
	response: JudgedResponse,
	truncatedAt: number | null,
	passages: string[],
	citations: { url: string; domain: string }[],
) {
	const base = { runId: run.runId, subject: run.subject, stamp, truncatedAt };
	const confidence = (answer?: { confidence?: number }) =>
		typeof answer?.confidence === "number" ? answer.confidence : null;
	const pick = (evidence?: { choice: string }) =>
		evidence && evidence.choice !== NO_PASSAGE ? (passages[Number(evidence.choice.slice(1)) - 1] ?? null) : null;
	if (run.attributes.length > 0) {
		const drift = response.answers[DRIFT_KEY];
		const evidence = response.answers[DRIFT_EVIDENCE_KEY];
		return [
			...run.attributes.map((attribute) => {
				const answer = response.answers[attributeKey(attribute.id)];
				return {
					...base,
					kind: "attribute" as const,
					attributeId: attribute.id,
					questionVersion: attribute.questionVersion,
					verdict: answer.choice,
					probabilities: answer.probabilities,
					confidence: confidence(answer),
					passage: null,
					passageConfidence: null,
				};
			}),
			{
				...base,
				kind: "drift" as const,
				verdict: drift.choice,
				probabilities: drift.probabilities,
				confidence: confidence(drift),
				// The passage names the uncovered quality, so it is kept only when there is one.
				passage: drift.choice === "yes" ? pick(evidence) : null,
				passageConfidence: drift.choice === "yes" ? confidence(evidence) : null,
			},
		];
	}
	return run.facts.map((fact) => {
		const answer = response.answers[factKey(fact.id)];
		const evidence = response.answers[factEvidenceKey(fact.id)];
		return {
			...base,
			kind: "fact" as const,
			factId: fact.id,
			...grounding(citations, run.names.domains, fact.sourceUrl),
			verdict: answer.choice,
			probabilities: answer.probabilities,
			confidence: confidence(answer),
			passage: pick(evidence),
			passageConfidence: confidence(evidence),
		};
	});
}

async function record(db: DbConnection, run: PendingRun, rows: ReturnType<typeof verdictRows>) {
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

/**
 * Every question for one answer. A fact run asks each fact and which passage it rests on; an
 * association run asks each attribute, the drift question, and which passage the drift is in. With
 * no sentence naming the subject there is nothing to offer, and no evidence question is asked.
 */
function questionsOf(run: PendingRun, passages: string[]): JevRequest["questions"] {
	const offers = passages.length > 0;
	if (run.attributes.length > 0) {
		const texts = run.attributes.map((attribute) => attribute.questionText);
		return Object.fromEntries([
			...run.attributes.map((attribute) => [
				attributeKey(attribute.id),
				attributeJudgeQuestion(run.subject, attribute.questionText),
			]),
			[DRIFT_KEY, driftQuestion(run.subject, texts)],
			...(offers ? [[DRIFT_EVIDENCE_KEY, driftEvidenceQuestion(run.subject, texts, passages)]] : []),
		]);
	}
	return Object.fromEntries(
		run.facts.flatMap((fact) => [
			[factKey(fact.id), factQuestion(run.subject, fact.statement, run.names.lookalikes)],
			...(offers ? [[factEvidenceKey(fact.id), factEvidenceQuestion(run.subject, fact.statement, passages)]] : []),
		]),
	);
}

type RunResult = { calls: number; verdicts: number; stop?: "over_ceiling" | "rate_limited" };

/**
 * An answer is stored only if it is one of the choices the question offered, with a probability for
 * each choice it gives. A verdict outside the set would be counted as an answer that is none of stated,
 * unclear, absent or contradicted; better no verdict than a made-up one.
 */
function usableAnswer(question: JevRequest["questions"][string], answer: unknown): boolean {
	if (typeof answer !== "object" || answer === null) return false;
	const { choice, probabilities, confidence } = answer as {
		choice?: unknown;
		probabilities?: unknown;
		confidence?: unknown;
	};
	if (typeof choice !== "string" || !Object.hasOwn(question.criteria, choice)) return false;
	if (typeof probabilities !== "object" || probabilities === null) return false;
	const values = Object.entries(probabilities);
	if (!values.every(([key, value]) => Object.hasOwn(question.criteria, key) && Number.isFinite(value))) return false;
	return confidence === undefined || confidence === null || Number.isFinite(confidence);
}

/** Judges one run's missing questions in one call, and records what came of it. */
async function judgeRun(
	db: DbConnection,
	transport: JevTransport,
	run: PendingRun,
	stamp: string,
	judge: string,
): Promise<RunResult> {
	const { textContent: text, citations } = extractRun(
		run.rawOutput,
		extractorFor({ provider: run.provider, model: run.model }),
	);
	if (!text) {
		await setAside(db, run.runId, stamp, "no_text", run.attempts);
		return { calls: 0, verdicts: 0 };
	}
	const questionsFor = (judged: string): Questions => {
		const passages = evidencePassages(judged, run.names);
		return { questions: questionsOf(run, passages), passages };
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
	const questions = questionsOf(run, asked.passages);
	const unanswered = Object.keys(questions).find((key) => !response.answers?.[key]);
	if (unanswered) {
		await failed(db, run, stamp, `no answer for ${unanswered}`);
		return { calls: asked.calls, verdicts: 0 };
	}
	const unusable = Object.entries(questions).find(([key, question]) => !usableAnswer(question, response.answers[key]));
	if (unusable) {
		await failed(db, run, stamp, `unusable answer for ${unusable[0]}`);
		return { calls: asked.calls, verdicts: 0 };
	}
	const rows = verdictRows(run, stamp, response, asked.truncatedAt, asked.passages, citations);
	return { calls: asked.calls, verdicts: await record(db, run, rows) };
}

/** One job's worth of judging. `judge` names the transport for the stamp: the Jev model, or "stub". */
export async function judgePendingRuns(
	db: DbConnection,
	transport: JevTransport,
	judge: string,
	limit = RUNS_PER_JOB,
	options: { association: boolean } = { association: ASSOCIATION_ENABLED },
): Promise<JudgeOutcome> {
	const stamp = perceptionStamp(judge);
	const outcome: JudgeOutcome = { runs: 0, calls: 0, verdicts: 0, overCeiling: false, rateLimited: false };
	const factRuns = await pendingRuns(db, stamp, limit);
	const associationRuns = options.association ? await pendingAssociationRuns(db, stamp, limit - factRuns.length) : [];
	const runs = [...factRuns, ...associationRuns];
	// An organization that runs out of calls part-way through is skipped for the rest of the job; the
	// others carry on. A rate limit is Jev's, not an organization's, so it ends the job.
	const outOfCalls = new Set<string>();
	for (const run of runs) {
		if (outOfCalls.has(run.organizationId)) continue;
		// One run that can't be judged must not take the job, and every run behind it, down with it.
		const result = await judgeRun(db, transport, run, stamp, judge).catch(async (error) => {
			await failed(db, run, stamp, String(error));
			return { calls: 0, verdicts: 0 } as RunResult;
		});
		outcome.calls += result.calls;
		outcome.verdicts += result.verdicts;
		if (result.verdicts > 0) outcome.runs++;
		if (result.stop === "over_ceiling") {
			outcome.overCeiling = true;
			outOfCalls.add(run.organizationId);
		}
		if (result.stop === "rate_limited") {
			outcome.rateLimited = true;
			break;
		}
	}
	return outcome;
}
