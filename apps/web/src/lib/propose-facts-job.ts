import { getDeployment } from "@workspace/deployment";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import {
	FACT_SUGGESTION_RUNS_PER_DAY,
	type FactProposalResult,
	PROPOSE_FACTS_QUEUE,
	PROPOSE_FACTS_QUEUE_OPTIONS,
	type ProposeFactsJobData,
} from "@workspace/lib/perception/propose-facts";
import { eq } from "drizzle-orm";
import { getBoss } from "@/lib/boss-client";
import { brandJobs, cancelLatestBrandJob, IN_FLIGHT_STATES, readBrandJob } from "@/lib/brand-jobs";
import { FactRuleError, listFacts } from "@/server/perception-facts-core";

const WINDOW_MS = 24 * 60 * 60 * 1000;
const GENERIC_FAILURE = "Couldn't suggest facts. Please try again.";

/** What the page shows: the screened proposals and what was looked for, not the raw rejects. */
export type FactSuggestions = Pick<FactProposalResult, "proposals" | "heldBack" | "coverage"> & {
	/** False when every research provider failed, so "no suggestions" isn't mistaken for "nothing found". */
	answered: boolean;
};

export type FactSuggestionsStatus =
	| { status: "none" }
	| { status: "pending" }
	| { status: "done"; suggestions: FactSuggestions }
	| { status: "failed"; error: string };

/** The worker creates the queue too; creating it here as well means a send never races its startup. */
async function proposerQueue() {
	const boss = await getBoss();
	await boss.createQueue(PROPOSE_FACTS_QUEUE, PROPOSE_FACTS_QUEUE_OPTIONS);
	return boss;
}

/** Runs left today. Failed runs don't count: they spent nothing the user saw. */
export async function suggestionRunsLeft(brandId: string): Promise<number> {
	await proposerQueue();
	const since = Date.now() - WINDOW_MS;
	const used = (await brandJobs(PROPOSE_FACTS_QUEUE, brandId)).filter(
		(job) => job.state !== "failed" && job.createdOn.getTime() > since,
	).length;
	return Math.max(0, FACT_SUGGESTION_RUNS_PER_DAY - used);
}

/** Starts one paid proposal run for the brand, unless one is already running or today's runs are used up. */
export async function enqueueFactSuggestions(brandId: string): Promise<void> {
	if (getDeployment().mode === "cloud") throw new FactRuleError("Fact suggestions aren't available here yet.");
	const boss = await proposerQueue();
	const [latest] = await brandJobs(PROPOSE_FACTS_QUEUE, brandId);
	if (latest && IN_FLIGHT_STATES.has(latest.state)) return;
	if ((await suggestionRunsLeft(brandId)) === 0) {
		throw new FactRuleError(
			`Fact suggestions run at most ${FACT_SUGGESTION_RUNS_PER_DAY} times a day. Try again tomorrow.`,
		);
	}
	const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
	if (!brand) throw new FactRuleError("Brand not found.");
	if (!brand.website) throw new FactRuleError("Add the brand's website first: suggestions are read from it.");
	const facts = await listFacts(db, brandId);
	const data: ProposeFactsJobData = {
		brandId,
		brandName: brand.name,
		website: brand.website,
		existingStatements: facts.filter((fact) => fact.validTo === null).map((fact) => fact.statement),
	};
	await boss.send(PROPOSE_FACTS_QUEUE, data);
}

export async function getFactSuggestions(brandId: string): Promise<FactSuggestionsStatus> {
	await proposerQueue();
	const [latest] = await brandJobs(PROPOSE_FACTS_QUEUE, brandId);
	if (!latest) return { status: "none" };
	const job = await readBrandJob<FactProposalResult>(PROPOSE_FACTS_QUEUE, brandId, GENERIC_FAILURE);
	if (job.status !== "done") return job;
	const { proposals, heldBack, coverage, answeredBy } = job.output;
	return { status: "done", suggestions: { proposals, heldBack, coverage, answered: answeredBy !== null } };
}

export async function cancelFactSuggestions(brandId: string): Promise<void> {
	await cancelLatestBrandJob(PROPOSE_FACTS_QUEUE, brandId);
}
