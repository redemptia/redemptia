/**
 * Proposes a brand's attributes, each paired with the market prompt that would elicit it: the
 * qualities AI answers judge this brand on. The user keeps up to 10.
 *
 * Warm start reads what AI assistants already say about the brand: a sample of its own tracked
 * answers. Cold start, for a brand with too few answers, works from the brand's name, category and
 * competitors. Neither reads the brand's website. That is the opposite of the fact proposer, on
 * purpose: attributes taken from a brand's own positioning would measure whether AI repeats its
 * marketing, not what the market says about it. When every research provider fails, the proposal
 * degrades to a seeded list of generic qualities, labelled as such.
 */
import { z } from "zod";
import { wholeWordPattern } from "../mentions";
import type { Provider } from "../providers";
import { attributeQuestion, failureStateProblem, joinsTooManyQualities } from "./attribute-question";
import { researchProviders } from "./propose-facts";

export const PROPOSED_ATTRIBUTES_MAX = 15;
const CANDIDATES_MIN = 16;
const CANDIDATES_MAX = 20;

/** About 15–30k tokens: enough answers to show the market's vocabulary, cheap enough to ask on demand. */
export const WARM_SAMPLE_CHARS = 60_000;
/** Per answer, so one long answer can't fill the sample. */
export const WARM_ANSWER_CHARS = 3_000;
/** Fewer answers or prompts than this describe a handful of questions, not the market: start cold instead. */
export const WARM_MIN_ANSWERS = 15;
export const WARM_MIN_PROMPTS = 5;
/** Shown proposals per theme, so the sample's loudest topic can't fill the list. */
export const SHOWN_PER_THEME = 2;

const MAX_LABEL_CHARS = 40;
const MAX_QUALITY_CHARS = 120;
const MAX_MARKET_PROMPT_CHARS = 200;
const MIN_QUOTE_CHARS = 8;

export interface SampleAnswer {
	promptId: string;
	prompt: string;
	/** The prompt's perception class, or null for an ordinary prompt. */
	promptClass: string | null;
	model: string;
	text: string;
}

export type ProposalGrounding = "warm" | "cold" | "seeded";

export interface ProposedAttribute {
	label: string;
	/** The noun phrase the question asks about; what a merge joins. */
	quality: string;
	/** The broad topic it belongs to, shared by related proposals, such as pricing. */
	theme: string;
	/** The judge's question; `{subject}` stands for the brand's name. */
	questionText: string;
	/** The question a buyer would ask about the market, naming no brand. */
	marketPromptText: string;
	/** Warm start only: words from a sampled answer that characterise the brand on this quality. */
	quote: string | null;
}

export interface RejectedAttribute {
	item: unknown;
	reason: string;
}

export interface AttributeProposalResult {
	grounding: ProposalGrounding;
	/** What the warm start read: the n behind its proposals. */
	sample: { answers: number; prompts: number; models: number; chars: number };
	proposals: ProposedAttribute[];
	heldBack: ProposedAttribute[];
	rejected: RejectedAttribute[];
	/** The provider and model that answered, or null for the seeded list. */
	answeredBy: { provider: string; model: string } | null;
	failures: { provider: string; error: string }[];
}

const proposalSchema = z.object({
	attributes: z
		.array(
			z.object({
				label: z.string().describe("A short display name, one to four words, such as 'Developer experience'."),
				theme: z
					.string()
					.describe(
						"A short lowercase key for the broad topic, shared by related attributes, such as pricing or openness.",
					),
				quality: z
					.string()
					.describe(
						"One quality, as a noun phrase that completes \"how does this answer characterise the brand's ...\", such as 'ease of getting started'.",
					),
				marketPrompt: z
					.string()
					.describe("A question a buyer would ask an AI assistant about the market, naming no brand."),
				quote: z
					.string()
					.describe(
						"Warm start: a verbatim phrase from one of the answers that characterises the brand on this quality. Cold start: an empty string.",
					),
			}),
		)
		.describe(`Between ${CANDIDATES_MIN} and ${CANDIDATES_MAX} candidate attributes.`),
});

type RawAttribute = z.infer<typeof proposalSchema>["attributes"][number];

/**
 * Up to `WARM_SAMPLE_CHARS` of answer text, one answer per prompt in turn, so a brand with many
 * prompts is sampled across all of them rather than through the first few. Each prompt starts at a
 * different model, so a sample that stops part-way still hears from every model. Answers to fact
 * prompts are left out: those prompts are written to draw out facts, which would come back as
 * attributes ("open source", quoted from "Yes, it is open source").
 */
export function selectSample(candidates: SampleAnswer[]): SampleAnswer[] {
	const byPrompt = new Map<string, SampleAnswer[]>();
	for (const answer of candidates) {
		if (!answer.text.trim() || answer.promptClass === "fact") continue;
		byPrompt.set(answer.promptId, [...(byPrompt.get(answer.promptId) ?? []), answer]);
	}
	const models = [...new Set(candidates.map((answer) => answer.model))].sort();
	const queues = [...byPrompt.values()].map((answers, i) => {
		const rank = (answer: SampleAnswer) =>
			(models.indexOf(answer.model) - i + models.length * answers.length) % models.length;
		return answers.sort((a, b) => rank(a) - rank(b));
	});
	const sample: SampleAnswer[] = [];
	let chars = 0;
	while (queues.some((queue) => queue.length > 0)) {
		for (const queue of queues) {
			const next = queue.shift();
			if (!next) continue;
			const text = next.text.slice(0, WARM_ANSWER_CHARS);
			if (chars + text.length > WARM_SAMPLE_CHARS) return sample;
			sample.push({ ...next, text });
			chars += text.length;
		}
	}
	return sample;
}

interface BrandContext {
	brandName: string;
	aliases: string[];
	competitors: string[];
	category: string | null;
}

function marketLine(context: BrandContext): string {
	const competitors = context.competitors.length ? context.competitors.join(", ") : "none recorded";
	return `${context.brandName}${context.category ? `, ${context.category}` : ""}. Competitors: ${competitors}.`;
}

const SHARED_RULES = (brandName: string) => `Each attribute must be:
- A neutral dimension an answer can be positive, negative or mixed about, never a complaint or a failure. Name what is being judged, not what goes wrong: "reliability of projects that stay online", not "project pausing"; "portability", not "vendor lock-in"; "ease of learning", not "learning curve". The quote may be a complaint; the label and quality must not be.
- One quality, not a feature list or a fact. "Pricing and value for money" is an attribute an answer can be positive, negative or mixed about; "has a free plan" is a fact, and doesn't belong here.
- A quality buyers compare brands in this market on, so a question about the market can rank brands on it.
- Distinct from every other attribute you propose. Don't split one idea in two ("ease of setup" and "onboarding"), but keep qualities apart that an answer could praise one of and criticise the other.

For each, give:
- label: a short, neutral display name.
- theme: a short lowercase key for the broad topic, shared by related attributes ("pricing" for both value for money and cost predictability).
- quality: a noun phrase that completes "How does this answer characterise ${brandName}'s ...?", such as "ease of getting started" or "pricing and value for money". One quality; never more than two joined by "and".
- marketPrompt: the question a buyer would ask an AI assistant whose answer would name and rank brands on this quality, such as "Which backend-as-a-service platforms are easiest to get started with?". Name no brand in it, neither ${brandName} nor a competitor.`;

export function buildWarmPrompt(context: BrandContext, sample: SampleAnswer[]): string {
	const answers = sample
		.map((answer, i) => `=== ANSWER ${i + 1} (${answer.model}) to "${answer.prompt}" ===\n${answer.text}`)
		.join("\n\n");
	return `You are finding the qualities AI assistants judge ${context.brandName} on, so that how they describe it can be tracked over time.

The brand: ${marketLine(context)}

Below are ${sample.length} answers AI assistants gave to questions this brand tracks. Read how they characterise ${context.brandName}: what they praise, what they criticise, what they compare it on. Propose between ${CANDIDATES_MIN} and ${CANDIDATES_MAX} attributes in the answers' own vocabulary, most often discussed first, and spread across every topic the answers discuss rather than many angles on one. Use the words the answers use, not the brand's own marketing language.

${SHARED_RULES(context.brandName)}
- quote: a phrase copied word for word from one answer where ${context.brandName} is characterised on this quality. Every attribute needs one, so propose only qualities the answers actually discuss.

${answers}`;
}

export function buildColdPrompt(context: BrandContext, trackedPrompts: string[]): string {
	const prompts = trackedPrompts.length
		? `\n\nQuestions the brand tracks, which show the market it competes in:\n${trackedPrompts
				.slice(0, 40)
				.map((p) => `- ${p}`)
				.join("\n")}`
		: "";
	return `You are proposing the qualities AI assistants are likely to judge ${context.brandName} on, so that how they describe it can be tracked over time. No AI answers about it have been collected yet, so this is a starting guess that the user will correct.

The brand: ${marketLine(context)}${prompts}

Propose between ${CANDIDATES_MIN} and ${CANDIDATES_MAX} attributes, the ones buyers in this market most often weigh first. Describe the market's view, not ${context.brandName}'s own positioning: include qualities it may be weak on.

${SHARED_RULES(context.brandName)}
- quote: an empty string.`;
}

/** Whitespace, case and typographic quotes vary between an answer and a model's copy of it. */
function comparable(text: string): string {
	return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();
}

function oneLine(text: string): string {
	return text.trim().replace(/\s+/g, " ");
}

/** Why a market prompt can't be tracked, or null when it can: a question about the market, naming no brand. */
export function marketPromptProblem(prompt: string, names: string[]): string | null {
	const text = oneLine(prompt);
	if (/[\r\n]/.test(prompt) || text.length < 10 || text.length > MAX_MARKET_PROMPT_CHARS) {
		return `Keep the market prompt to one line of 10 to ${MAX_MARKET_PROMPT_CHARS} characters.`;
	}
	if (!text.endsWith("?")) return "Write the market prompt as a question, ending with a question mark.";
	const named = names.find((name) => name.trim() && wholeWordPattern(name.trim()).test(text));
	if (named) return `Name no brand in the market prompt (it names ${named}), so the answer shows who comes to mind.`;
	return null;
}

function rejectionReason(
	item: RawAttribute,
	context: BrandContext,
	sampleText: string | null,
	seen: { labels: Set<string>; qualities: Set<string>; prompts: Set<string> },
): string | null {
	const label = oneLine(item.label);
	const quality = oneLine(item.quality);
	if (!label || label.length > MAX_LABEL_CHARS) return `label must be 1 to ${MAX_LABEL_CHARS} characters`;
	if (quality.length < 3 || quality.length > MAX_QUALITY_CHARS) return "quality missing or too long";
	const failure = failureStateProblem(label, quality);
	if (failure) return failure;
	if (joinsTooManyQualities(quality)) return "joins more than two qualities";
	const promptIssue = marketPromptProblem(item.marketPrompt, [
		context.brandName,
		...context.aliases,
		...context.competitors,
	]);
	if (promptIssue) return promptIssue;
	if (sampleText !== null) {
		const quote = comparable(item.quote);
		if (quote.length < MIN_QUOTE_CHARS) return "quote too short to check";
		if (!sampleText.includes(quote)) return "quote isn't in the answers";
	}
	if (seen.labels.has(comparable(label))) return "duplicate label";
	if (seen.qualities.has(comparable(quality))) return "duplicate quality";
	if (seen.prompts.has(comparable(item.marketPrompt))) return "duplicate market prompt";
	return null;
}

/** Keeps what a user could adopt as it stands, in the model's order; says why each other one was dropped. */
export function screenAttributes(
	raw: RawAttribute[],
	context: BrandContext,
	sample: SampleAnswer[] | null,
	existingLabels: string[],
): Pick<AttributeProposalResult, "proposals" | "heldBack" | "rejected"> {
	const sampleText = sample ? comparable(sample.map((answer) => answer.text).join("\n")) : null;
	const seen = {
		labels: new Set(existingLabels.map(comparable)),
		qualities: new Set<string>(),
		prompts: new Set<string>(),
	};
	const kept: ProposedAttribute[] = [];
	const rejected: RejectedAttribute[] = [];
	for (const item of raw) {
		const reason = rejectionReason(item, context, sampleText, seen);
		if (reason) {
			rejected.push({ item, reason });
			continue;
		}
		const label = oneLine(item.label);
		const quality = oneLine(item.quality);
		seen.labels.add(comparable(label));
		seen.qualities.add(comparable(quality));
		seen.prompts.add(comparable(item.marketPrompt));
		kept.push({
			label,
			quality,
			theme: comparable(item.theme) || comparable(quality),
			questionText: attributeQuestion(quality),
			marketPromptText: oneLine(item.marketPrompt),
			quote: sampleText !== null ? oneLine(item.quote) : null,
		});
	}
	return { ...selectShown(kept), rejected };
}

/**
 * Up to the shown maximum, one per theme in turn (themes in the order the model first raised them),
 * and at most `SHOWN_PER_THEME` from any theme. The rest are held back, not discarded.
 */
function selectShown(kept: ProposedAttribute[]): Pick<AttributeProposalResult, "proposals" | "heldBack"> {
	const themes = new Map<string, ProposedAttribute[]>();
	for (const proposal of kept) themes.set(proposal.theme, [...(themes.get(proposal.theme) ?? []), proposal]);
	const queues = [...themes.values()].map((queue) => queue.slice(0, SHOWN_PER_THEME));
	const proposals: ProposedAttribute[] = [];
	while (proposals.length < PROPOSED_ATTRIBUTES_MAX && queues.some((queue) => queue.length > 0)) {
		for (const queue of queues) {
			const next = queue.shift();
			if (next && proposals.length < PROPOSED_ATTRIBUTES_MAX) proposals.push(next);
		}
	}
	return { proposals, heldBack: kept.filter((proposal) => !proposals.includes(proposal)) };
}

/** Generic qualities most markets compare on: what the user starts from when no provider answered. */
const SEEDED: { label: string; quality: string; asks: string }[] = [
	{ label: "Ease of use", quality: "ease of use", asks: "are easiest to use" },
	{ label: "Pricing & value", quality: "pricing and value for money", asks: "offer the best value for money" },
	{ label: "Reliability", quality: "reliability", asks: "are the most reliable" },
	{ label: "Performance", quality: "performance", asks: "perform best" },
	{ label: "Customer support", quality: "customer support", asks: "have the best customer support" },
	{ label: "Security", quality: "security", asks: "are the most secure" },
	{ label: "Integrations", quality: "integrations with other tools", asks: "integrate best with other tools" },
	{ label: "Scalability", quality: "ability to scale", asks: "scale best as you grow" },
	{ label: "Documentation", quality: "documentation", asks: "have the best documentation" },
	{ label: "Innovation", quality: "pace of innovation", asks: "are the most innovative" },
	{ label: "Community", quality: "community and ecosystem", asks: "have the strongest community" },
	{ label: "Onboarding", quality: "onboarding and setup", asks: "are quickest to set up" },
];

export function seededAttributes(category: string | null, existingLabels: string[]): ProposedAttribute[] {
	const market = category?.trim() || "products in this category";
	const existing = new Set(existingLabels.map(comparable));
	return SEEDED.filter((seed) => !existing.has(comparable(seed.label))).map((seed) => ({
		label: seed.label,
		quality: seed.quality,
		theme: comparable(seed.label),
		questionText: attributeQuestion(seed.quality),
		marketPromptText: `Which ${market} ${seed.asks}?`,
		quote: null,
	}));
}

function sampleSize(sample: SampleAnswer[]): AttributeProposalResult["sample"] {
	return {
		answers: sample.length,
		prompts: new Set(sample.map((answer) => answer.promptId)).size,
		models: new Set(sample.map((answer) => answer.model)).size,
		chars: sample.reduce((sum, answer) => sum + answer.text.length, 0),
	};
}

export async function proposeAttributes(input: {
	brandName: string;
	aliases: string[];
	competitors: string[];
	category: string | null;
	existingLabels: string[];
	/** Candidate answers; the proposer samples them, and starts cold when too few qualify. */
	sample: SampleAnswer[];
	/** The brand's tracked prompts, read for the market they show when there are too few answers. */
	trackedPrompts: string[];
	providers?: Provider[];
}): Promise<AttributeProposalResult> {
	const offered = selectSample(input.sample);
	const warm = offered.length >= WARM_MIN_ANSWERS && sampleSize(offered).prompts >= WARM_MIN_PROMPTS;
	const sample = warm ? offered : [];
	const result: AttributeProposalResult = {
		grounding: warm ? "warm" : "cold",
		sample: sampleSize(sample),
		proposals: [],
		heldBack: [],
		rejected: [],
		answeredBy: null,
		failures: [],
	};
	const prompt = warm ? buildWarmPrompt(input, sample) : buildColdPrompt(input, input.trackedPrompts);
	const { answer, failures } = await askInTurn(prompt, input.providers ?? researchProviders());
	if (!answer) {
		return {
			...result,
			failures,
			grounding: "seeded",
			proposals: seededAttributes(input.category, input.existingLabels),
		};
	}
	const screened = screenAttributes(answer.attributes, input, warm ? sample : null, input.existingLabels);
	return { ...result, ...screened, failures, answeredBy: answer.answeredBy };
}

/** Each provider in turn until one answers in the expected shape. */
async function askInTurn(prompt: string, providers: Provider[]) {
	const failures: AttributeProposalResult["failures"] = [];
	for (const provider of providers) {
		if (!provider.runStructuredResearch) continue;
		try {
			const answer = await provider.runStructuredResearch({ prompt, schema: proposalSchema, webSearch: false });
			const answeredBy = { provider: provider.id, model: answer.modelVersion ?? "unknown" };
			return { answer: { attributes: answer.object.attributes, answeredBy }, failures };
		} catch (error) {
			failures.push({ provider: provider.id, error: error instanceof Error ? error.message : String(error) });
		}
	}
	return { answer: null, failures };
}
