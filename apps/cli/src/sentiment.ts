import * as p from "@clack/prompts";
import pc from "picocolors";
import type { EnvMap } from "./config.js";
import { assertNotCancelled, link } from "./util.js";

const GEMINI_KEY_URL = "https://aistudio.google.com/apikey";

/**
 * The sentiment analyzer's own key. It's separate from the direct LLM APIs: the
 * analyzer calls Gemini with SENTIMENT_API_KEY and never borrows another
 * provider's key, so without one it simply doesn't run.
 */
export async function askSentimentKey(env: EnvMap): Promise<void> {
	p.note(
		[
			"Sentiment judges how each answer treats your brand and competitors:",
			"recommended, neutral, with caveats, or advised against.",
			"",
			`It uses a Gemini API key: ${link(pc.cyan(GEMINI_KEY_URL), GEMINI_KEY_URL)}`,
			"Spend is capped at $2 per organization per day (ENRICHMENT_DAILY_CAP_USD).",
			"Use a paid key for real customers' data: free-tier terms may let Google",
			"use what is sent. Leave it blank to skip; add SENTIMENT_API_KEY later.",
		].join("\n"),
		"Sentiment analysis (optional)",
	);
	const key = await p.password({ message: "Gemini API key for sentiment (blank to skip)" });
	assertNotCancelled(key);
	const trimmed = key?.trim();
	if (trimmed) env.SENTIMENT_API_KEY = trimmed;
}
