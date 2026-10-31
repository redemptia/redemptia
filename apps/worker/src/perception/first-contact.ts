/**
 * The staged first run: one brand, a few prompts, a call budget in the tens, one pass against the real
 * judge, and a report of every reply beside what our code made of it. Nothing about the real judge has
 * been seen yet; three things only resolve on first contact (how it answers refusals, hedges and
 * counterfactuals; how often the skip rule fires on real answers; whether it bills per call, per
 * question or per token), so the output has to make each readable rather than inferred.
 */
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { brands, promptRuns, prompts } from "@workspace/lib/db/schema";
import {
	brandFacts,
	perceptionPrompts,
	perceptionRunStatus,
	perceptionVerdicts,
} from "@workspace/lib/db/schema-perception";
import { extractorFor, extractRun } from "@workspace/lib/text-extraction";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { JEV_MODEL, type JevRequest, type JevResponse, type JevTransport, RateLimited } from "../mention-judge/jev";
import { couldNameSubject } from "./could-name";
import { judgePendingRuns, LOOKBACK_DAYS, perceptionStamp } from "./judge-runs";

/** Calls in the tens: whatever is asked for, a first run never makes more than this. */
export const MAX_FIRST_CONTACT_CALLS = 100;
export const DEFAULTS = { prompts: 5, perPrompt: 2, maxCalls: 30, skipSample: 300 };

export interface CallRecord {
	runId: string;
	elapsedMs: number;
	request: {
		question: unknown;
		answerChars: number;
		answer: string;
		questions: Record<string, { instructions: string; criteria: Record<string, string> }>;
	};
	/** Exactly what the judge returned, or null when the call threw. */
	response: unknown;
	error: { name: string; message: string } | null;
}

/** Wraps a transport so no more than `maxCalls` ever go out, and each one is kept with its reply, verbatim. */
export function recordingTransport(real: JevTransport, maxCalls: number) {
	const calls: CallRecord[] = [];
	let current = "";
	const transport: JevTransport = async (request: JevRequest): Promise<JevResponse> => {
		if (calls.length >= maxCalls) throw new RateLimited(0, `first-contact budget of ${maxCalls} calls used`);
		const started = performance.now();
		const record: CallRecord = {
			runId: current,
			elapsedMs: 0,
			request: {
				question: request.state.question,
				answerChars: String(request.state.answer ?? "").length,
				answer: String(request.state.answer ?? ""),
				questions: Object.fromEntries(
					Object.entries(request.questions).map(([key, q]) => [
						key,
						{ instructions: q.instructions, criteria: q.criteria },
					]),
				),
			},
			response: null,
			error: null,
		};
		calls.push(record);
		try {
			const response = await real(request);
			record.response = response;
			return response;
		} catch (error) {
			record.error = { name: (error as Error).name, message: (error as Error).message };
			throw error;
		} finally {
			record.elapsedMs = Math.round(performance.now() - started);
		}
	};
	return {
		transport,
		calls,
		forRun: (runId: string) => {
			current = runId;
		},
	};
}

/** Rough labels for reading the report by kind of answer. A guess from the words, only for sorting. */
export function shapeOf(text: string): string[] {
	const shapes: string[] = [];
	if (/\b(i'm sorry|i am sorry|i can(?:no|')t (?:help|assist|provide)|unable to (?:help|assist|provide))\b/i.test(text))
		shapes.push("refusal");
	if (
		/(?:don't|do not|doesn't|does not) have (?:reliable |enough |specific |any )?(?:information|data|details)|not (?:sure|certain)|couldn't find|cannot (?:verify|confirm)|as of my (?:last|knowledge)/i.test(
			text,
		)
	)
		shapes.push("hedge");
	if (
		/\b(unlike|whereas|instead of|rather than|hypothetical(?:ly)?|would have|if .{1,40}(?:were|was|charged))\b/i.test(
			text,
		)
	)
		shapes.push("contrast or counterfactual");
	if (/^\s*\|.*\|\s*$/m.test(text)) shapes.push("table");
	return shapes.length > 0 ? shapes : ["plain"];
}

export interface RunReport {
	runId: string;
	promptId: string;
	prompt: string;
	model: string;
	provider: string | null;
	answerChars: number;
	shape: string[];
	/** What the skip rule decides for this answer, before any call. */
	skipRule: "would skip" | "spends the call";
	calls: CallRecord[];
	ours: {
		verdicts: {
			factId: string;
			verdict: string;
			probabilities: unknown;
			confidence: number | null;
			passage: string | null;
			passageConfidence: number | null;
			skipped: boolean;
			truncatedAt: number | null;
		}[];
		setAside: { outcome: string | null; attempts: number; lastError: string | null } | null;
	};
}

export interface FirstContactReport {
	startedAt: string;
	finishedAt: string;
	brandId: string;
	brandName: string;
	stamp: string;
	limits: { prompts: number; perPrompt: number; maxCalls: number };
	stoppedBecause: "done" | "budget" | "nothing pending";
	runs: RunReport[];
	totals: {
		runs: number;
		calls: number;
		questions: number;
		answerChars: number;
		inputTokens: number | null;
		outputTokens: number | null;
	};
	skipRule: { evaluated: number; wouldSkip: number; samples: { runId: string; chars: number; start: string }[] };
}

async function brandSubject(db: DbConnection, brandId: string) {
	const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
	if (!brand) throw new Error(`No brand ${brandId}`);
	return {
		name: brand.name,
		subject: {
			name: brand.name,
			aliases: brand.aliases ?? [],
			domains: [brand.website, ...(brand.additionalDomains ?? [])],
		},
	};
}

/** Per-run text and citations, read the way the job reads them. */
async function answerOf(db: DbConnection, runId: string) {
	const [run] = await db
		.select({ rawOutput: promptRuns.rawOutput, provider: promptRuns.provider, model: promptRuns.model })
		.from(promptRuns)
		.where(eq(promptRuns.id, runId));
	return extractRun(run?.rawOutput, extractorFor({ provider: run?.provider ?? null, model: run?.model ?? "" }));
}

export interface FirstContactOptions {
	brandId: string;
	transport: JevTransport;
	/** The judge's name for the stamp: the Jev model. */
	judge?: string;
	prompts?: number;
	perPrompt?: number;
	maxCalls?: number;
	skipSample?: number;
}

interface Selected {
	id: string;
	promptId: string;
	prompt: string;
	model: string;
	provider: string | null;
}

/** The first few fact prompts, and the newest answers of each that the judge hasn't read at this stamp. */
async function selectRuns(
	db: DbConnection,
	brandId: string,
	stamp: string,
	limits: { prompts: number; perPrompt: number },
): Promise<Selected[]> {
	const facts = await db.select({ id: brandFacts.id }).from(brandFacts).where(eq(brandFacts.brandId, brandId));
	if (facts.length === 0) throw new Error(`Brand ${brandId} has no facts to check; add some before a first run.`);
	const since = sql`now() - make_interval(days => ${LOOKBACK_DAYS})`;
	const promptRows = await db
		.select({ id: prompts.id, value: prompts.value })
		.from(prompts)
		.innerJoin(perceptionPrompts, and(eq(perceptionPrompts.promptId, prompts.id), eq(perceptionPrompts.class, "fact")))
		.where(eq(prompts.brandId, brandId))
		.orderBy(asc(prompts.createdAt))
		.limit(limits.prompts);
	const selected: Selected[] = [];
	for (const prompt of promptRows) {
		const rows = await db
			.select({ id: promptRuns.id, model: promptRuns.model, provider: promptRuns.provider })
			.from(promptRuns)
			.where(
				and(
					eq(promptRuns.promptId, prompt.id),
					gte(promptRuns.createdAt, since),
					sql`NOT EXISTS (SELECT 1 FROM perception_verdicts v WHERE v.run_id = ${promptRuns.id} AND v.stamp = ${stamp})`,
				),
			)
			.orderBy(desc(promptRuns.createdAt))
			.limit(limits.perPrompt);
		for (const row of rows) selected.push({ ...row, promptId: prompt.id, prompt: prompt.value });
	}
	return selected;
}

/** How often the skip rule would fire on the brand's recent answers: no calls, only reading. */
async function sampleSkipRule(
	db: DbConnection,
	brandId: string,
	subject: Parameters<typeof couldNameSubject>[1],
	size: number,
): Promise<FirstContactReport["skipRule"]> {
	const since = sql`now() - make_interval(days => ${LOOKBACK_DAYS})`;
	const sample = await db
		.select({ id: promptRuns.id })
		.from(promptRuns)
		.innerJoin(
			perceptionPrompts,
			and(eq(perceptionPrompts.promptId, promptRuns.promptId), eq(perceptionPrompts.class, "fact")),
		)
		.where(and(eq(promptRuns.brandId, brandId), gte(promptRuns.createdAt, since)))
		.orderBy(desc(promptRuns.createdAt))
		.limit(size);
	const skipRule: FirstContactReport["skipRule"] = { evaluated: 0, wouldSkip: 0, samples: [] };
	for (const { id } of sample) {
		const { textContent, citations } = await answerOf(db, id);
		if (!textContent) continue;
		skipRule.evaluated++;
		if (couldNameSubject(textContent, subject, citations)) continue;
		skipRule.wouldSkip++;
		if (skipRule.samples.length < 10)
			skipRule.samples.push({ runId: id, chars: textContent.length, start: textContent.slice(0, 240) });
	}
	return skipRule;
}

async function reportRun(
	db: DbConnection,
	run: Selected,
	stamp: string,
	subject: Parameters<typeof couldNameSubject>[1],
	calls: CallRecord[],
): Promise<RunReport> {
	const { textContent, citations } = await answerOf(db, run.id);
	const text = textContent ?? "";
	const verdicts = await db
		.select()
		.from(perceptionVerdicts)
		.where(and(eq(perceptionVerdicts.runId, run.id), eq(perceptionVerdicts.stamp, stamp)));
	const [status] = await db.select().from(perceptionRunStatus).where(eq(perceptionRunStatus.runId, run.id));
	return {
		runId: run.id,
		promptId: run.promptId,
		prompt: run.prompt,
		model: run.model,
		provider: run.provider,
		answerChars: text.length,
		shape: shapeOf(text),
		skipRule: text && !couldNameSubject(text, subject, citations) ? "would skip" : "spends the call",
		calls,
		ours: {
			verdicts: verdicts.map((v) => ({
				factId: v.factId ?? "",
				verdict: v.verdict,
				probabilities: v.probabilities,
				confidence: v.confidence,
				passage: v.passage,
				passageConfidence: v.passageConfidence,
				skipped: v.skipped,
				truncatedAt: v.truncatedAt,
			})),
			setAside: status ? { outcome: status.outcome, attempts: status.attempts, lastError: status.lastError } : null,
		},
	};
}

function totalsOf(runs: RunReport[]): FirstContactReport["totals"] {
	const calls = runs.flatMap((run) => run.calls);
	const usage = calls
		.map((call) => (call.response as JevResponse | null)?.usage)
		.filter((u): u is NonNullable<typeof u> => !!u);
	const measured = usage.length === calls.length && calls.length > 0;
	return {
		runs: runs.length,
		calls: calls.length,
		questions: calls.reduce((n, call) => n + Object.keys(call.request.questions).length, 0),
		answerChars: calls.reduce((n, call) => n + call.request.answerChars, 0),
		inputTokens: measured ? usage.reduce((n, u) => n + u.input_tokens, 0) : null,
		outputTokens: measured ? usage.reduce((n, u) => n + u.output_tokens, 0) : null,
	};
}

const limitsOf = (options: Pick<FirstContactOptions, "prompts" | "perPrompt" | "maxCalls">) => ({
	prompts: options.prompts ?? DEFAULTS.prompts,
	perPrompt: options.perPrompt ?? DEFAULTS.perPrompt,
	maxCalls: Math.min(options.maxCalls ?? DEFAULTS.maxCalls, MAX_FIRST_CONTACT_CALLS),
});

/** What a run would do, without doing it: the answers it would judge, and how the skip rule reads the brand's. */
export async function planFirstContact(db: DbConnection, options: Omit<FirstContactOptions, "transport">) {
	const { subject } = await brandSubject(db, options.brandId);
	const limits = limitsOf(options);
	const selected = await selectRuns(db, options.brandId, perceptionStamp(options.judge ?? JEV_MODEL), limits);
	const skipRule = await sampleSkipRule(db, options.brandId, subject, options.skipSample ?? DEFAULTS.skipSample);
	return { limits, selected, skipRule };
}

export async function runFirstContact(db: DbConnection, options: FirstContactOptions): Promise<FirstContactReport> {
	const startedAt = new Date();
	const judge = options.judge ?? JEV_MODEL;
	const stamp = perceptionStamp(judge);
	const limits = limitsOf(options);
	const { name: brandName, subject } = await brandSubject(db, options.brandId);
	const selected = await selectRuns(db, options.brandId, stamp, limits);

	const recorder = recordingTransport(options.transport, limits.maxCalls);
	const runs: RunReport[] = [];
	let stoppedBecause: FirstContactReport["stoppedBecause"] = selected.length === 0 ? "nothing pending" : "done";
	for (const run of selected) {
		const before = recorder.calls.length;
		recorder.forRun(run.id);
		const outcome = await judgePendingRuns(db, recorder.transport, judge, 1, { association: false, only: [run.id] });
		runs.push(await reportRun(db, run, stamp, subject, recorder.calls.slice(before)));
		if (outcome.rateLimited) {
			stoppedBecause = "budget";
			break;
		}
	}
	const skipRule = await sampleSkipRule(db, options.brandId, subject, options.skipSample ?? DEFAULTS.skipSample);
	return {
		startedAt: startedAt.toISOString(),
		finishedAt: new Date().toISOString(),
		brandId: options.brandId,
		brandName,
		stamp,
		limits,
		stoppedBecause,
		runs,
		totals: totalsOf(runs),
		skipRule,
	};
}

/** The three ways Jev might bill, priced from what the first run was charged. */
export function unitPrices(report: Pick<FirstContactReport, "totals">, billedUsd: number, dailyCeiling = 2000) {
	const { calls, questions, inputTokens, answerChars } = report.totals;
	if (calls === 0) throw new Error("The first run made no calls, so there is nothing to price.");
	const tokens = inputTokens ?? Math.round(answerChars / 4 + calls * 1100);
	const perCall = billedUsd / calls;
	const perQuestion = billedUsd / questions;
	const perMillionTokens = (billedUsd / tokens) * 1_000_000;
	return {
		calls,
		questions,
		tokens,
		tokensAreMeasured: inputTokens !== null,
		perCall,
		perQuestion,
		perMillionTokens,
		questionsPerCall: questions / calls,
		tokensPerCall: tokens / calls,
		/** A day at perception's ceiling, at this run's averages. Equal at these averages; they diverge as facts or answers grow. */
		ceilingDayUsd: perCall * dailyCeiling,
	};
}
