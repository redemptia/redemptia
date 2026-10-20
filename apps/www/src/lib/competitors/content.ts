import type { FaqItem } from "@/lib/faqs";
import {
	type Competitor,
	type CompetitorCategory,
	type FeatureKey,
	getFeatureLabel,
	REDEMPTIA_FEATURES,
} from "./types";

// Prose-friendly category nouns (acronyms kept uppercase, descriptive words
// lowercased) so they read naturally mid-sentence — e.g. "an AI visibility
// tracking tool", "a traditional SEO tool".
export const CATEGORY_NOUN: Record<CompetitorCategory, string> = {
	tracking: "AI visibility tracking",
	content: "content generation",
	"api-developer": "developer API",
	ecommerce: "e-commerce",
	"seo-traditional": "traditional SEO",
	"open-source": "open-source",
	other: "AI visibility",
};

export function indefiniteArticle(phrase: string): "a" | "an" {
	return /^[aeiou]/i.test(phrase) ? "an" : "a";
}

export function isOpenSource(competitor: Competitor): boolean {
	return (competitor.features.openSource ?? false) || competitor.category === "open-source";
}

// Engines in rough order of how much AI search traffic they carry, so the
// soundbite names the gaps a buyer is most likely to care about first.
const SOUNDBITE_ENGINES: FeatureKey[] = [
	"chatgpt",
	"googleAiMode",
	"googleAiOverviews",
	"gemini",
	"perplexity",
	"claude",
	"copilot",
	"grok",
];

const SOUNDBITE_FEATURES: [FeatureKey, string][] = [
	["dataExportApi", "API"],
	["mcpServer", "MCP server"],
	["sentimentAnalysis", "sentiment analysis"],
	["citationAnalytics", "citation tracking"],
];

// Copyleft and source-available licenses carry obligations that MIT doesn't.
const RESTRICTIVE_LICENSES: Record<string, string> = {
	"AGPL-3.0": "AGPL-3.0, so running a modified version as a service means publishing your changes",
	"GPL-3.0": "GPL-3.0, so any modified version you distribute has to be released under the GPL too",
	"FSL-1.1-ALv2": "source-available under the FSL, which bars competing commercial use for two years",
	"BUSL-1.1": "source-available under the BSL, which restricts production use",
};

// Acquired trackers that were absorbed into the buyer's product, the evidence
// behind the acquisition soundbite.
const ABSORBED_EXAMPLES = ["XFunnel", "Hall", "Meridian"];

function joinAnd(items: string[]): string {
	if (items.length <= 2) return items.join(" and ");
	return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function joinOr(items: string[]): string {
	if (items.length <= 2) return items.join(" or ");
	return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;
}

/** The soundbite for a tool that shut down, pivoted, or was bought, if it did. */
function fateSoundbite(competitor: Competitor): string | undefined {
	const name = competitor.name;
	if (competitor.status === "defunct" || competitor.status === "shutting-down") {
		return `${name} has shut down. Redemptia is open source, so the tool you build your reporting on can't disappear the same way.`;
	}
	if (competitor.status === "pivoted") {
		return `${name} has pivoted away from AI visibility. Redemptia is open source and built for this one job, so it can't be pivoted out from under you.`;
	}
	if (competitor.status === "acquired") {
		if (competitor.fate) {
			return `${name} is gone as a standalone product. ${competitor.fate.summary} Redemptia is open source, so no acquisition can take it away from you.`;
		}
		const absorbed = ABSORBED_EXAMPLES.filter((example) => example !== name);
		return `${name} has been acquired, and acquired AI visibility tools rarely stay put: ${joinAnd(absorbed)} were all folded into their buyers' products. Redemptia is open source, so no acquisition can take it away from you.`;
	}
	return undefined;
}

/**
 * The one-line case for Redemptia over a tool, shown at the top of its comparison
 * page. Hand-written soundbites win; otherwise it leads with the most decisive
 * fact we hold: the tool is gone, was bought, carries a restrictive license, or
 * is missing engines and features Redemptia has.
 */
export function getSoundbite(competitor: Competitor): string {
	if (competitor.soundbite) return competitor.soundbite;
	const name = competitor.name;

	const fate = fateSoundbite(competitor);
	if (fate) return fate;

	const license = competitor.license ? RESTRICTIVE_LICENSES[competitor.license] : undefined;
	if (license) {
		return `${name} is ${license}. Redemptia is MIT-licensed, so you can run, modify, and embed it with no strings attached.`;
	}

	const tracksAnyEngine = SOUNDBITE_ENGINES.some((key) => competitor.features[key]);
	const missingEngines = tracksAnyEngine
		? SOUNDBITE_ENGINES.filter((key) => REDEMPTIA_FEATURES[key] && !competitor.features[key]).map(getFeatureLabel)
		: [];
	const missingFeatures = SOUNDBITE_FEATURES.filter(
		([key]) => REDEMPTIA_FEATURES[key] && !competitor.features[key],
	).map(([, label]) => label);

	const gaps: string[] = [];
	if (missingEngines.length > 0) gaps.push(`doesn't list ${joinOr(missingEngines.slice(0, 3))} among its engines`);
	if (missingFeatures.length > 0) gaps.push(`has no ${joinOr(missingFeatures.slice(0, 2))}`);
	if (gaps.length > 0) {
		return `${name} ${gaps.join(" and ")}. Redemptia has all of that, and it's free to self-host.`;
	}

	const price = competitor.pricing?.startingPrice;
	if (price && !isOpenSource(competitor)) {
		return `${name} starts at ${price} and is closed source. Redemptia covers the same engines, and it's free to self-host.`;
	}
	if (isOpenSource(competitor)) {
		return `${name} and Redemptia are both open source, so it comes down to fit: compare the engines and features below.`;
	}
	return `${name} is closed source, so you can't check how its numbers are made. Redemptia is open source and free to self-host.`;
}

/**
 * A 40–60 word lead "answer block" for a comparison page, written to be lifted
 * verbatim into an AI answer for "Redemptia vs {competitor}" style queries. Branches
 * on whether the competitor is itself open source so the claim stays accurate.
 */
export function getComparisonVerdict(competitor: Competitor): string {
	const name = competitor.name;

	if (isOpenSource(competitor)) {
		return `Redemptia and ${name} are both open-source AI visibility tools you can self-host and audit. Redemptia's focus is transparent, independently verifiable tracking across ChatGPT, Claude, Perplexity, and Google AI Overviews — with white-label support for agencies and a documented methodology behind every number.`;
	}

	const noun = CATEGORY_NOUN[competitor.category];
	return `Redemptia is an open-source, self-hostable alternative to ${name}, ${indefiniteArticle(noun)} ${noun} tool. Both measure how AI answer engines describe your brand, but Redemptia ships every line of code, runs on your own infrastructure, and is free to self-host — so your data stays yours and each metric is independently verifiable.`;
}

/**
 * Per-competitor FAQ generated from the competitor dataset. The same items are
 * rendered visibly on the page and emitted as FAQPage JSON-LD, so the structured
 * data always matches what a reader (or an AI crawler) sees. Every answer is
 * derived from fields we actually store, so it stays truthful per competitor.
 */
export function getComparisonFaqs(competitor: Competitor): FaqItem[] {
	const name = competitor.name;
	const openSource = isOpenSource(competitor);
	const noun = CATEGORY_NOUN[competitor.category];
	const faqs: FaqItem[] = [];

	faqs.push({
		question: `What is the difference between Redemptia and ${name}?`,
		answer: openSource
			? `Both Redemptia and ${name} are open source, so you can self-host either one and inspect the code. Redemptia focuses specifically on transparent, independently verifiable AI visibility tracking across every major answer engine, with white-label support for agencies and a fully documented methodology behind each number.`
			: `Redemptia is an open-source, self-hostable AI visibility platform, while ${name} is a closed-source ${noun} tool. Both track how AI answer engines describe your brand, but Redemptia gives you the full source code and runs on your own infrastructure, so you can verify every metric and keep your data in-house.`,
	});

	faqs.push({
		question: `Is Redemptia a free, open-source alternative to ${name}?`,
		answer: `Yes. Redemptia is a free, open-source alternative to ${name}. You can self-host the full platform at no cost, read every line of code, and track your AI visibility across ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews without per-seat or per-prompt fees.`,
	});

	faqs.push({
		question: `Is ${name} open source?`,
		answer: openSource
			? `Yes, ${name} is open source. Redemptia is open source as well and is built specifically for self-hosted, independently verifiable AI visibility tracking, so you can audit exactly how each metric is calculated.`
			: `No, ${name} is a closed-source, hosted product, so you cannot inspect how its metrics are calculated. Redemptia is fully open source — you can audit the code, self-host it on your own infrastructure, and avoid vendor lock-in.`,
	});

	faqs.push({
		question: `Can I self-host Redemptia instead of ${name}?`,
		answer: `Yes. Redemptia is designed to be self-hosted — deploy it on your own infrastructure in minutes with the CLI. You keep full ownership of your data and prompts, with no per-seat pricing and no third-party dashboard holding your visibility history.`,
	});

	return faqs;
}
