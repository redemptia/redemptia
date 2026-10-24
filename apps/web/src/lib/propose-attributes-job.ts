import { getDeployment } from "@workspace/deployment";
import { db } from "@workspace/lib/db/db";
import { brands, competitors } from "@workspace/lib/db/schema";
import {
	ATTRIBUTE_SUGGESTION_RUNS_PER_DAY,
	type AttributeProposalResult,
	PROPOSE_ATTRIBUTES_QUEUE,
	PROPOSE_ATTRIBUTES_QUEUE_OPTIONS,
	type ProposeAttributesJobData,
} from "@workspace/lib/perception/propose-attributes";
import { eq } from "drizzle-orm";
import { getBoss } from "@/lib/boss-client";
import { brandJobs, IN_FLIGHT_STATES, readBrandJob } from "@/lib/brand-jobs";
import { AttributeRuleError, listAttributes } from "@/server/perception-attributes-core";

const WINDOW_MS = 24 * 60 * 60 * 1000;
const GENERIC_FAILURE = "Couldn't suggest attributes. Please try again.";
const MAX_CATEGORY_CHARS = 120;

/** What the page shows: the screened proposals and what they were read from, not the raw rejects. */
export type AttributeSuggestions = Pick<AttributeProposalResult, "grounding" | "sample" | "proposals" | "heldBack">;

export type AttributeSuggestionsStatus =
	| { status: "none" }
	| { status: "pending" }
	| { status: "done"; suggestions: AttributeSuggestions }
	| { status: "failed"; error: string };

/** The worker creates the queue too; creating it here as well means a send never races its startup. */
async function proposerQueue() {
	const boss = await getBoss();
	await boss.createQueue(PROPOSE_ATTRIBUTES_QUEUE, PROPOSE_ATTRIBUTES_QUEUE_OPTIONS);
	return boss;
}

/** Runs left today. Failed runs don't count: they spent nothing the user saw. */
export async function attributeSuggestionRunsLeft(brandId: string): Promise<number> {
	await proposerQueue();
	const since = Date.now() - WINDOW_MS;
	const used = (await brandJobs(PROPOSE_ATTRIBUTES_QUEUE, brandId)).filter(
		(job) => job.state !== "failed" && job.createdOn.getTime() > since,
	).length;
	return Math.max(0, ATTRIBUTE_SUGGESTION_RUNS_PER_DAY - used);
}

/** Starts one paid proposal run for the brand, unless one is already running or today's runs are used up. */
export async function enqueueAttributeSuggestions(brandId: string, category: string | null): Promise<void> {
	if (getDeployment().mode === "cloud")
		throw new AttributeRuleError("Attribute suggestions aren't available here yet.");
	const boss = await proposerQueue();
	const [latest] = await brandJobs(PROPOSE_ATTRIBUTES_QUEUE, brandId);
	if (latest && IN_FLIGHT_STATES.has(latest.state)) return;
	if ((await attributeSuggestionRunsLeft(brandId)) === 0) {
		throw new AttributeRuleError(
			`Attribute suggestions run at most ${ATTRIBUTE_SUGGESTION_RUNS_PER_DAY} times a day. Try again tomorrow.`,
		);
	}
	const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
	if (!brand) throw new AttributeRuleError("Brand not found.");
	const rivals = await db.select({ name: competitors.name }).from(competitors).where(eq(competitors.brandId, brandId));
	const attributes = await listAttributes(db, brandId);
	const data: ProposeAttributesJobData = {
		brandId,
		brandName: brand.name,
		aliases: brand.aliases,
		competitors: rivals.map((rival) => rival.name),
		category: category?.trim().replace(/\s+/g, " ").slice(0, MAX_CATEGORY_CHARS) || null,
		existingLabels: attributes.filter((attribute) => !attribute.retiredAt).map((attribute) => attribute.label),
	};
	await boss.send(PROPOSE_ATTRIBUTES_QUEUE, data);
}

export async function getAttributeSuggestions(brandId: string): Promise<AttributeSuggestionsStatus> {
	await proposerQueue();
	const [latest] = await brandJobs(PROPOSE_ATTRIBUTES_QUEUE, brandId);
	if (!latest) return { status: "none" };
	const job = await readBrandJob<AttributeProposalResult>(PROPOSE_ATTRIBUTES_QUEUE, brandId, GENERIC_FAILURE);
	if (job.status !== "done") return job;
	const { grounding, sample, proposals, heldBack } = job.output;
	return { status: "done", suggestions: { grounding, sample, proposals, heldBack } };
}
