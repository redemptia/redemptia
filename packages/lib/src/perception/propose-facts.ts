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
/** Candidates asked of the model: more than are shown, since a missed fact costs more than a rejected one. */
const CANDIDATES_MIN = 20;
const CANDIDATES_MAX = 30;
const MAX_PROMPT_CHARS = 200;
/** Shorter than this, a quote ("$25") is on almost any page and proves nothing. */
const MIN_QUOTE_CHARS = 8;
const FETCH_TIMEOUT_MS = 15_000;

/**
 * What the proposer looks for, most important first. Deployment, licence and integrations come
 * early on purpose: they change, and stale training data gets them wrong.
 */
export const FACT_TARGETS = ["pricing", "deployment", "licence", "integrations", "security", "product"] as const;
export type FactTarget = (typeof FACT_TARGETS)[number];

/**
 * How to recognise each target's page. Patterns are tried in order, so a more specific one
 * ("integrations") wins over a looser one ("partners"); guesses are tried only when no link matches.
 */
const TARGET_PAGES: Record<FactTarget, { patterns: RegExp[]; guesses: string[] }> = {
	pricing: { patterns: [/pricing/i, /\bplans?\b/i], guesses: ["/pricing", "/plans"] },
	deployment: {
		patterns: [/self-?host/i, /on-?prem/i, /\b(deploy|install|download|docker|kubernetes)/i],
		guesses: ["/docs/guides/self-hosting", "/docs/self-hosting", "/self-hosting", "/self-hosted", "/download"],
	},
	licence: { patterns: [/licen[cs]e/i, /open-?source/i], guesses: ["/license", "/licence", "/open-source"] },
	integrations: {
		patterns: [/integrat/i, /marketplace|connectors?|\bapps\b/i, /partners?/i],
		guesses: ["/integrations", "/partners/integrations", "/docs/integrations", "/marketplace"],
	},
	security: { patterns: [/security/i, /trust|compliance|soc-?2|gdpr|hipaa/i], guesses: ["/security", "/trust"] },
	product: { patterns: [/features?\b/i, /\bproduct\b|platform\b/i], guesses: ["/features", "/product"] },
};

export interface SourcePage {
	url: string;
	/** Which target this page was read for; the home page is "home". */
	target: FactTarget | "home";
	/** When the page was read, as an ISO timestamp. */
	readAt: string;
	text: string;
}

/** Where each target was looked for, and what was found: the user sees the gaps. */
export interface TargetCoverage {
	target: FactTarget;
	url: string | null;
	how: "link" | "guess" | "repository" | null;
}

export interface ProposedFact {
	statement: string;
	category: string;
	prompt: string;
	sourceUrl: string;
	target: FactTarget | "home";
	readAt: string;
	quote: string;
}

export interface RejectedProposal {
	item: unknown;
	reason: string;
}

export interface FactProposalResult {
	proposals: ProposedFact[];
	/** Candidates that passed screening but weren't shown, because the shown list is full. */
	heldBack: ProposedFact[];
	rejected: RejectedProposal[];
	coverage: TargetCoverage[];
	pages: { url: string; target: string; readAt: string; chars: number }[];
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
				quote: z
					.string()
					.describe("A verbatim phrase from that page that states the claim, including what any number applies to."),
			}),
		)
		.describe(`Between ${CANDIDATES_MIN} and ${CANDIDATES_MAX} candidate facts.`),
});

type RawProposal = z.infer<typeof proposalSchema>["facts"][number];

interface Link {
	url: URL;
	text: string;
}

function sameSite(url: URL, home: URL): boolean {
	const root = home.hostname.replace(/^www\./, "");
	return url.hostname === root || url.hostname.endsWith(`.${root}`);
}

/** A page's links, from its HTML, or from the reader's markdown when the HTML is blocked. */
async function pageLinks(page: URL): Promise<Link[]> {
	let raw: { href: string; text: string }[] = [];
	try {
		const response = await fetch(page, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: "follow" });
		if (response.ok && (response.headers.get("content-type") ?? "").includes("html")) {
			const { document } = parseHTML(await response.text());
			raw = [...document.querySelectorAll("a[href]")].map((a) => ({
				href: a.getAttribute("href") ?? "",
				text: a.textContent ?? "",
			}));
		}
	} catch {
		// Fall through to the reader.
	}
	if (raw.length === 0) {
		try {
			const response = await fetch(`https://r.jina.ai/${page}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS * 2) });
			if (response.ok) {
				const markdown = await response.text();
				raw = [...markdown.matchAll(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => ({ href: m[2], text: m[1] }));
			}
		} catch {
			// No links; targets fall back to guessed paths.
		}
	}
	return raw.flatMap(({ href, text }) => {
		try {
			const url = new URL(href, page);
			url.hash = "";
			return url.protocol.startsWith("http") ? [{ url, text }] : [];
		} catch {
			return [];
		}
	});
}

async function exists(url: string): Promise<boolean> {
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: "follow" });
		return response.ok;
	} catch {
		return false;
	}
}

/** The brand's main source repository, when the site links to exactly one GitHub owner's repos. */
function repositoryOf(links: Link[]): { owner: string; repo: string } | null {
	const counts = new Map<string, number>();
	for (const { url } of links) {
		if (url.hostname !== "github.com") continue;
		const [owner, repo] = url.pathname.split("/").filter(Boolean);
		if (!owner || !repo) continue;
		const key = `${owner}/${repo.replace(/\.git$/, "")}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
	if (!best) return null;
	const [owner, repo] = best[0].split("/");
	return { owner, repo };
}

/** Reads a repository's licence from GitHub's API, as a page the proposer can quote. */
async function readRepository(owner: string, repo: string, now: () => Date): Promise<SourcePage | null> {
	try {
		const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
			headers: { Accept: "application/vnd.github+json" },
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (!response.ok) return null;
		const body = (await response.json()) as {
			full_name?: string;
			html_url?: string;
			description?: string | null;
			license?: { name?: string; spdx_id?: string } | null;
		};
		if (!body.html_url) return null;
		const licence = body.license?.name
			? `License: ${body.license.name} (SPDX identifier ${body.license.spdx_id ?? "unknown"})`
			: "License: none declared";
		return {
			url: body.html_url,
			target: "licence",
			readAt: now().toISOString(),
			text: [`Repository: ${body.full_name}`, body.description ? `Description: ${body.description}` : "", licence]
				.filter(Boolean)
				.join("\n"),
		};
	} catch {
		return null;
	}
}

function bestLink(links: Link[], home: URL, patterns: RegExp[]): Link | undefined {
	const site = links.filter((link) => sameSite(link.url, home) && link.url.toString() !== home.toString());
	for (const pattern of patterns) {
		// A link's path is a better signal than its text: "Pricing" in a footer usually points at /pricing.
		const match =
			site.find((link) => pattern.test(link.url.pathname)) ?? site.find((link) => pattern.test(link.text.trim()));
		if (match) return match;
	}
	return undefined;
}

/** A target's page: a matching link, else the first guessed path that exists. */
async function findTarget(target: FactTarget, links: Link[], home: URL): Promise<TargetCoverage> {
	const { patterns, guesses } = TARGET_PAGES[target];
	const link = bestLink(links, home, patterns);
	if (link) return { target, url: link.url.toString(), how: "link" };
	for (const guess of guesses) {
		const url = new URL(guess, home).toString();
		if (await exists(url)) return { target, url, how: "guess" };
	}
	return { target, url: null, how: null };
}

/**
 * Finds a page for each target, in priority order, from the links on the home page and the docs
 * landing page. The licence also comes from the brand's GitHub repository when the site links to
 * one, since that is where a licence is stated authoritatively. A target whose page came back empty
 * is reported as not found.
 */
export async function discoverPages(
	website: string,
	now: () => Date = () => new Date(),
): Promise<{ pages: SourcePage[]; coverage: TargetCoverage[] }> {
	const home = new URL(website.startsWith("http") ? website : `https://${website}`);
	home.hash = "";
	const links = await pageLinks(home);
	const docs = bestLink(links, home, [/\bdocs?\b|documentation/i]);
	if (docs) links.push(...(await pageLinks(docs.url)));

	const coverage: TargetCoverage[] = [];
	for (const target of FACT_TARGETS) coverage.push(await findTarget(target, links, home));
	const urls = new Map<string, FactTarget | "home">([[home.toString(), "home"]]);
	for (const entry of coverage) if (entry.url && !urls.has(entry.url)) urls.set(entry.url, entry.target);

	const fetched = await Promise.all(
		[...urls].map(async ([url, target]) => ({
			url,
			target,
			readAt: now().toISOString(),
			text: await getWebsiteExcerpt(url),
		})),
	);
	const pages: SourcePage[] = fetched.filter((page) => page.text.trim().length > 0);
	const repository = repositoryOf(links);
	const repositoryPage = repository ? await readRepository(repository.owner, repository.repo, now) : null;
	if (repositoryPage) pages.push(repositoryPage);

	return {
		pages,
		coverage: coverage.map((entry) => {
			if (entry.target === "licence" && !entry.url && repositoryPage) {
				return { target: entry.target, url: repositoryPage.url, how: "repository" };
			}
			return entry.url && pages.some((page) => page.url === entry.url) ? entry : { ...entry, url: null, how: null };
		}),
	};
}

export function buildProposalPrompt(brandName: string, pages: SourcePage[]): string {
	const sources = pages
		.map((page, i) => `=== PAGE ${i + 1} (${page.target}): ${page.url} ===\n${page.text}`)
		.join("\n\n");
	return `You are helping ${brandName} record facts about itself, so that answers AI assistants give about ${brandName} can be checked against them.

Below are pages from ${brandName}'s own website, and possibly its source repository, each labelled with what it was read for. Propose between ${CANDIDATES_MIN} and ${CANDIDATES_MAX} candidate facts. Be exhaustive within each page: a pricing page usually states many separate facts (each plan's price, each limit, each condition), and every one is a candidate. The user filters the list, so a missed fact costs more than an extra one.

Give the most attention, in this order, to: pricing and plans; deployment (whether it can be self-hosted, where it runs); licence and open-source status; integrations; security and compliance; then product specifics. AI assistants most often get deployment, licence and integration facts wrong, so propose every one the pages state.

Each fact must be:
- Checkable: a price, a limit, a plan name, a named integration, a supported platform or deployment option, a licence, a certification, a yes-or-no capability. An answer could plainly get it right or wrong.
- Atomic: exactly one claim. No "and", no "or", no semicolons, at most one amount. "Has a free plan" and "The free plan includes 500 MB of database storage" are two facts.
- A plain assertion naming ${brandName}, under 300 characters, one line.
- Stated on the page you cite. Copy a phrase from that page, word for word, that states it, including what any number applies to: "From $599 / month" under the Team plan, not just "$599".

Do not propose marketing claims (fast, easy, best, trusted, leading), customer counts, testimonials, awards, roadmap items or anything about competitors.

Pair each fact with the question a buyer would type into an AI assistant whose answer would state or contradict it, such as "What does ${brandName} cost?", "Does ${brandName} integrate with Salesforce?" or "Is ${brandName} self-hostable?". Keep the question short, name ${brandName} in it, and don't give the answer away in it.

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
}

/** The figures a statement asserts, without thousands separators: "50,000" and "50000" match. */
function figures(text: string): string[] {
	return (text.match(/\d[\d,.]*\d|\d/g) ?? []).map((figure) => figure.replace(/,/g, ""));
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
	const quoted = figures(item.quote);
	if (figures(statement).some((figure) => !quoted.includes(figure))) return "quote doesn't contain the fact's figure";
	if (state.seenStatements.has(comparable(statement))) return "duplicate fact";
	if (state.seenPrompts.has(comparable(item.prompt))) return "duplicate prompt";
	return null;
}

/**
 * Up to the shown maximum, taken round-robin across targets in priority order, so a long pricing
 * page can't crowd out the one licence fact. The rest are held back, not discarded.
 */
function selectShown(kept: ProposedFact[]): { proposals: ProposedFact[]; heldBack: ProposedFact[] } {
	const queues = [...FACT_TARGETS, "home" as const].map((target) => kept.filter((fact) => fact.target === target));
	const proposals: ProposedFact[] = [];
	while (proposals.length < PROPOSED_FACTS_MAX && queues.some((queue) => queue.length > 0)) {
		for (const queue of queues) {
			const next = queue.shift();
			if (next && proposals.length < PROPOSED_FACTS_MAX) proposals.push(next);
		}
	}
	return { proposals, heldBack: kept.filter((fact) => !proposals.includes(fact)) };
}

/** Keeps the proposals a user could accept as they stand; says why each other one was dropped. */
export function screenProposals(
	raw: RawProposal[],
	pages: SourcePage[],
	brandName: string,
	existingStatements: string[],
): { proposals: ProposedFact[]; heldBack: ProposedFact[]; rejected: RejectedProposal[] } {
	const byUrl = new Map(pages.map((page) => [page.url, page]));
	const state: ScreenState = {
		brandName,
		seenStatements: new Set(existingStatements.map(comparable)),
		seenPrompts: new Set(),
	};
	const kept: ProposedFact[] = [];
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
		kept.push({
			statement,
			category: item.category.trim().toLowerCase().slice(0, 40),
			prompt,
			sourceUrl: page.url,
			target: page.target,
			readAt: page.readAt,
			quote: normalizeStatement(item.quote),
		});
	}
	return { ...selectShown(kept), rejected };
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
	discovered?: { pages: SourcePage[]; coverage: TargetCoverage[] };
}): Promise<FactProposalResult> {
	const { pages, coverage } = input.discovered ?? (await discoverPages(input.website));
	const result: FactProposalResult = {
		proposals: [],
		heldBack: [],
		rejected: [],
		coverage,
		pages: pages.map((page) => ({ url: page.url, target: page.target, readAt: page.readAt, chars: page.text.length })),
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
