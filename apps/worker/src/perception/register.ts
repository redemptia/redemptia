import * as Sentry from "@sentry/node";
import { getDeployment } from "@workspace/deployment";
import { db } from "@workspace/lib/db/db";
import { prompts } from "@workspace/lib/db/schema";
import { perceptionPrompts } from "@workspace/lib/db/schema-perception";
import { perceptionAvailableIn } from "@workspace/lib/perception/limits";
import {
	brandAnswerCandidates,
	PROPOSE_ATTRIBUTES_QUEUE,
	PROPOSE_ATTRIBUTES_QUEUE_OPTIONS,
	type ProposeAttributesJobData,
	proposeAttributes,
} from "@workspace/lib/perception/propose-attributes";
import {
	PROPOSE_FACTS_QUEUE,
	PROPOSE_FACTS_QUEUE_OPTIONS,
	type ProposeFactsJobData,
	proposeFacts,
} from "@workspace/lib/perception/propose-facts";
import { and, eq, isNull } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { JEV_MODEL, type JevTransport, stubTransport, typesafeTransport } from "../mention-judge/jev";
import { judgePendingRuns } from "./judge-runs";
import { buildPerceptionRollups } from "./rollup";

export const PERCEPTION_JUDGE_QUEUE = "perception-judge";

function perceptionJudge(apiKey = process.env.TYPESAFE_API_KEY?.trim()): { transport: JevTransport; judge: string } {
	if (!apiKey) throw new Error("TYPESAFE_API_KEY is required");
	return apiKey === "stub"
		? { transport: stubTransport, judge: "stub" }
		: { transport: typesafeTransport(apiKey), judge: JEV_MODEL };
}

/**
 * Registers the perception job in elmo's worker. It never throws: a failure to register is logged
 * and reported, and the rest of the worker carries on. Not in cloud, where perception prompts aren't
 * priced yet, nor in the read-only demo.
 */
export async function registerPerceptionJobs(boss: PgBoss): Promise<void> {
	try {
		if (!perceptionAvailableIn(getDeployment().mode)) return;
		const { transport, judge } = perceptionJudge();
		// One job at a time across every worker, so two can't judge the same run.
		await boss.createQueue(PERCEPTION_JUDGE_QUEUE, { policy: "singleton", retryLimit: 0, expireInSeconds: 60 * 10 });
		await boss.schedule(PERCEPTION_JUDGE_QUEUE, "* * * * *", {}, { tz: "UTC", singletonKey: PERCEPTION_JUDGE_QUEUE });
		await boss.work(PERCEPTION_JUDGE_QUEUE, { localConcurrency: 1 }, async () => {
			const outcome = await judgePendingRuns(db, transport, judge);
			if (outcome.overCeiling) {
				console.warn("[perception] Daily Jev call ceiling reached; judging resumes tomorrow (UTC).");
			}
			// A failed rebuild keeps its markers, so the next job tries again; it must not fail the judging.
			try {
				await buildPerceptionRollups(db);
			} catch (error) {
				Sentry.captureException(error);
				console.error("[perception] Rollup rebuild failed:", error);
			}
			return outcome;
		});
		console.log(`Registered the perception judge (${judge})`);
	} catch (error) {
		Sentry.captureException(error);
		console.error("[perception] Not registered:", error);
	}
	await registerFactProposer(boss);
	await registerAttributeProposer(boss);
}

/** Separate from the judge, so a missing judge key doesn't take fact suggestions down with it. */
async function registerFactProposer(boss: PgBoss): Promise<void> {
	try {
		if (!perceptionAvailableIn(getDeployment().mode)) return;
		await boss.createQueue(PROPOSE_FACTS_QUEUE, PROPOSE_FACTS_QUEUE_OPTIONS);
		await boss.work<ProposeFactsJobData>(PROPOSE_FACTS_QUEUE, { localConcurrency: 2 }, async ([job]) => {
			if (!job) throw new Error("perception-propose-facts received an empty batch");
			return proposeFacts(job.data);
		});
	} catch (error) {
		Sentry.captureException(error);
		console.error("[perception] Fact proposer not registered:", error);
	}
}

/** The brand's own enabled prompts, not perception's: they show the market it competes in. */
async function trackedPrompts(brandId: string): Promise<string[]> {
	const rows = await db
		.select({ value: prompts.value })
		.from(prompts)
		.leftJoin(perceptionPrompts, eq(perceptionPrompts.promptId, prompts.id))
		.where(and(eq(prompts.brandId, brandId), eq(prompts.enabled, true), isNull(perceptionPrompts.promptId)));
	return rows.map((row) => row.value);
}

async function registerAttributeProposer(boss: PgBoss): Promise<void> {
	try {
		if (!perceptionAvailableIn(getDeployment().mode)) return;
		await boss.createQueue(PROPOSE_ATTRIBUTES_QUEUE, PROPOSE_ATTRIBUTES_QUEUE_OPTIONS);
		await boss.work<ProposeAttributesJobData>(PROPOSE_ATTRIBUTES_QUEUE, { localConcurrency: 2 }, async ([job]) => {
			if (!job) throw new Error("perception-propose-attributes received an empty batch");
			const [sample, tracked] = await Promise.all([
				brandAnswerCandidates(db, job.data.brandId),
				trackedPrompts(job.data.brandId),
			]);
			return proposeAttributes({ ...job.data, sample, trackedPrompts: tracked });
		});
	} catch (error) {
		Sentry.captureException(error);
		console.error("[perception] Attribute proposer not registered:", error);
	}
}
