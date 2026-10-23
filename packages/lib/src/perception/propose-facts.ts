/**
 * Proposes brand facts from the brand's own website, each with the buyer-style prompt that would
 * elicit it. The brand's own pricing page, docs and integrations list are the source of truth for
 * what is true about it, so unlike attribute proposal this reads the brand's own copy on purpose.
 *
 * Nothing proposed is ground truth until the user accepts it. To make accepting checkable, every
 * proposal carries the page it came from, when that page was read, and a quote from it; a proposal
 * whose quote isn't on the page it names is dropped, as is anything that fails the fact rules.
 */
import { RESEARCH_PROVIDER_PREFERENCE } from "@workspace/config/env-registry";
import { parseHTML } from "linkedom";
import { z } from "zod";
import { wholeWordPattern } from "../mentions";
import { resolveResearchProvider } from "../onboarding/llm";
import { getProvider, type Provider } from "../providers";
import { getWebsiteExcerpt } from "../website-excerpt";
import { atomicityHints, normalizeStatement, statementProblem } from "./fact-statement";

export const PROPOSED_FACTS_MIN = 12;
export const PROPOSED_FACTS_MAX = 15;
const MAX_PAGES = 7;
const MAX_PROMPT_CHARS = 200;
/** Shorter than this, a quote ("$25") is on almost any page and proves nothing. */
const MIN_QUOTE_CHARS = 8;
const FETCH_TIMEOUT_MS = 15_000;

/** The pages most likely to state checkable facts, by what their URL or link text says. */
const PAGE_KINDS: { kind: string; pattern: RegExp; guess: string }[] = [
	{ kind: "pricing", pattern: /pric|plans?\b/i, guess: "/pricing" },
	{ kind: "integrations", pattern: /integrat|marketplace|partners?\b|connectors?/i, guess: "/integrations" },
	{ kind: "docs", pattern: /\bdocs?\b|documentation/i, guess: "/docs" },
	{ kind: "deployment", pattern: /self-?host|on-?prem|deploy|install|download/i, guess: "/self-hosting" },
	{ kind: "security", pattern: /security|trust|compliance|gdpr|soc-?2|hipaa/i, guess: "/security" },
	{ kind: "features", pattern: /features?\b|product\b|platform\b/i, guess: "/features" },
];

export interface SourcePage {
	url: string;
	/** When the page was read, as an ISO timestamp. */
	readAt: string;
	text: string;
}

export interface ProposedFact {
	statement: string;
	category: string;
	prompt: string;
	sourceUrl: string;
	readAt: string;
	quote: string;
}

export interface RejectedProposal {
	item: unknown;
	reason: string;
}

export interface FactProposalResult {
	proposals: ProposedFact[];
	rejected: RejectedProposal[];
	pages: { url: string; readAt: string; chars: number }[];
	/** The provider and model that answered, or null when every provider failed. */
	answeredBy: { provider: string; model: string } | null;
	failures: { provider: string; error: string }[];
}

const proposalSchema = z.object({
	facts: z
		.array(
			z.object({
				statement: z.string().describe("One atomic, checkable claim about the brand, as a plain assertion."),
				category: z.string().describe("One or two lowercase words, such as pricing, integrations or deployment."),
				prompt: z.string().describe("The buyer-style question to an AI assistant whose answer would settle it."),
				sourceUrl: z.string().describe("Exactly one of the page URLs given, the one that states the claim."),
				quote: z.string().describe("A short verbatim span copied from that page that states the claim."),
			}),
		)
		.describe(`Between ${PROPOSED_FACTS_MIN} and ${PROPOSED_FACTS_MAX} facts.`),
});

type RawProposal = z.infer<typeof proposalSchema>["facts"][number];

function sameSite(url: URL, home: URL): boolean {
	const root = home.hostname.replace(/^www\./, "");
	return url.hostname === root || url.hostname.endsWith(`.${root}`);
}

/** Links on the home page, from its HTML, or from the reader's markdown when the HTML is blocked. */
async function homeLinks(home: URL): Promise<{ href: string; text: string }[]> {
	try {
		const response = await fetch(home, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: "follow" });
		if (response.ok && (response.headers.get("content-type") ?? "").includes("html")) {
			const { document } = parseHTML(await response.text());
			const links = [...document.querySelectorAll("a[href]")].map((a) => ({
				href: a.getAttribute("href") ?? "",
				text: a.textContent ?? "",
			}));
			if (links.length > 0) return links;
		}
	} catch {
		// Fall through to the reader.
	}
	try {
		const response = await fetch(`https://r.jina.ai/${home}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS * 2) });
		if (!response.ok) return [];
		const markdown = await response.text();
		return [...markdown.matchAll(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => ({ href: m[2], text: m[1] }));
	} catch {
		return [];
	}
}

/** The home page plus, for each kind of page, the best same-site link to it, or a guessed path. */
export async function discoverPages(website: string): Promise<string[]> {
	const home = new URL(website.startsWith("http") ? website : `https://${website}`);
	home.hash = "";
	const links = (await homeLinks(home)).flatMap(({ href, text }) => {
		try {
			const url = new URL(href, home);
			url.hash = "";
			return url.protocol.startsWith("http") && sameSite(url, home) ? [{ url: url.toString(), text }] : [];
		} catch {
			return [];
		}
	});
	const pages = [home.toString()];
	for (const { pattern, guess } of PAGE_KINDS) {
		// A link's path is a better signal than its text: "Pricing" in a footer usually points at /pricing.
		const match =
			links.find((link) => pattern.test(new URL(link.url).pathname)) ?? links.find((link) => pattern.test(link.text));
		const url = match?.url ?? new URL(guess, home).toString();
		if (!pages.includes(url)) pages.push(url);
		if (pages.length >= MAX_PAGES) break;
	}
	return pages;
}

export async function readPages(urls: string[], now: () => Date = () => new Date()): Promise<SourcePage[]> {
	const pages = await Promise.all(
		urls.map(async (url) => {
			const text = await getWebsiteExcerpt(url);
			return { url, readAt: now().toISOString(), text };
		}),
	);
	return pages.filter((page) => page.text.trim().length > 0);
}

export function buildProposalPrompt(brandName: string, pages: SourcePage[]): string {
	const sources = pages.map((page, i) => `=== PAGE ${i + 1}: ${page.url} ===\n${page.text}`).join("\n\n");
	return `You are helping ${brandName} record facts about itself, so that answers AI assistants give about ${brandName} can be checked against them.

Below are pages from ${brandName}'s own website. Propose between ${PROPOSED_FACTS_MIN} and ${PROPOSED_FACTS_MAX} facts that these pages state.

Each fact must be:
- Checkable: a price, a limit, a plan name, a named integration, a supported platform or deployment option, a certification, a yes-or-no capability. An answer could plainly get it right or wrong.
- Atomic: exactly one claim. No "and", no "or", no semicolons, at most one number. "Has a free plan" and "The free plan includes 500 MB of database storage" are two facts.
- A plain assertion naming ${brandName}, under 300 characters, one line.
- Stated on the page you cite. Copy a short quote from that page, word for word, that states it.

Do not propose marketing claims (fast, easy, best, trusted, leading), customer counts, testimonials, awards, roadmap items or anything about competitors.

Pair each fact with the question a buyer would type into an AI assistant whose answer would state or contradict it, such as "What does ${brandName} cost?", "Does ${brandName} integrate with Salesforce?" or "Is ${brandName} self-hostable?". Keep the question short, name ${brandName} in it, and don't give the answer away in it.

Spread the facts across pricing, limits, integrations, deployment, security and capabilities, as far as the pages allow.

${sources}`;
}

/** Whitespace, case and typographic quotes vary between a page and a model's copy of it. */
function comparable(text: string): string {
	return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();
}

function promptProblem(prompt: string, brandName: string): string | null {
	const text = normalizeStatement(prompt);
	if (/[\r\n]/.test(prompt) || text.length < 10 || text.length > MAX_PROMPT_CHARS) return "prompt length";
	if (!text.endsWith("?")) return "prompt is not a question";
	if (!wholeWordPattern(brandName).test(text)) return "prompt doesn't name the brand";
	return null;
}

interface ScreenState {
	brandName: string;
	seenStatements: Set<string>;
	seenPrompts: Set<string>;
	kept: number;
}

/** Why a proposal can't be shown as it stands, or null when it can. */
function rejectionReason(item: RawProposal, page: SourcePage | undefined, state: ScreenState): string | null {
	const statement = normalizeStatement(item.statement);
	const hard = statementProblem(statement);
	if (hard) return hard;
	const hints = atomicityHints(statement);
	if (hints.length > 0) return `not atomic: ${hints.join(" ")}`;
	const promptIssue = promptProblem(item.prompt, state.brandName);
	if (promptIssue) return promptIssue;
	if (!page) return "cites a page that wasn't read";
	if (comparable(item.quote).length < MIN_QUOTE_CHARS) return "quote too short to check";
	if (!comparable(page.text).includes(comparable(item.quote))) return "quote isn't on the cited page";
	if (state.seenStatements.has(comparable(statement))) return "duplicate fact";
	if (state.seenPrompts.has(comparable(item.prompt))) return "duplicate prompt";
	if (state.kept >= PROPOSED_FACTS_MAX) return "over the limit";
	return null;
}

/** Keeps the proposals a user could accept as they stand; says why each other one was dropped. */
export function screenProposals(
	raw: RawProposal[],
	pages: SourcePage[],
	brandName: string,
	existingStatements: string[],
): { proposals: ProposedFact[]; rejected: RejectedProposal[] } {
	const byUrl = new Map(pages.map((page) => [page.url, page]));
	const state: ScreenState = {
		brandName,
		seenStatements: new Set(existingStatements.map(comparable)),
		seenPrompts: new Set(),
		kept: 0,
	};
	const proposals: ProposedFact[] = [];
	const rejected: RejectedProposal[] = [];
	for (const item of raw) {
		const page = byUrl.get(item.sourceUrl);
		const reason = rejectionReason(item, page, state);
		if (reason !== null || !page) {
			rejected.push({ item, reason: reason ?? "cites a page that wasn't read" });
			continue;
		}
		const statement = normalizeStatement(item.statement);
		const prompt = normalizeStatement(item.prompt);
		state.seenStatements.add(comparable(statement));
		state.seenPrompts.add(comparable(prompt));
		state.kept++;
		proposals.push({
			statement,
			category: item.category.trim().toLowerCase().slice(0, 40),
			prompt,
			sourceUrl: page.url,
			readAt: page.readAt,
			quote: normalizeStatement(item.quote),
		});
	}
	return { proposals, rejected };
}

/**
 * The research provider first, then every other configured one, so one failing key doesn't end the
 * proposal. An explicit stub target means "spend nothing", so it never falls through to a paid one.
 */
export function researchProviders(env: Record<string, string | undefined> = process.env): Provider[] {
	const chain: Provider[] = [];
	try {
		chain.push(resolveResearchProvider(env));
	} catch {
		// No usable explicit target; the preference order below may still have one.
	}
	if (chain[0]?.id === "stub") return chain;
	for (const id of RESEARCH_PROVIDER_PREFERENCE) {
		const provider = getProvider(id);
		if (chain.some((p) => p.id === id) || !provider.isConfigured() || !provider.runStructuredResearch) continue;
		chain.push(provider);
	}
	return chain;
}

export async function proposeFacts(input: {
	brandName: string;
	website: string;
	existingStatements: string[];
	providers?: Provider[];
	pages?: SourcePage[];
}): Promise<FactProposalResult> {
	const pages = input.pages ?? (await readPages(await discoverPages(input.website)));
	const result: FactProposalResult = {
		proposals: [],
		rejected: [],
		pages: pages.map((page) => ({ url: page.url, readAt: page.readAt, chars: page.text.length })),
		answeredBy: null,
		failures: [],
	};
	if (pages.length === 0) return result;
	const prompt = buildProposalPrompt(input.brandName, pages);
	for (const provider of input.providers ?? researchProviders()) {
		if (!provider.runStructuredResearch) continue;
		try {
			const answer = await provider.runStructuredResearch({ prompt, schema: proposalSchema, webSearch: false });
			const screened = screenProposals(answer.object.facts, pages, input.brandName, input.existingStatements);
			return { ...result, ...screened, answeredBy: { provider: provider.id, model: answer.modelVersion ?? "unknown" } };
		} catch (error) {
			result.failures.push({ provider: provider.id, error: error instanceof Error ? error.message : String(error) });
		}
	}
	return result;
}
