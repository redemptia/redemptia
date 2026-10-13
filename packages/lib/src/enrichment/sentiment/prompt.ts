import { z } from "zod";

/**
 * Bump on any change to the prompt, schema or model that could change a
 * judgement. Judgements are cached per version, so a bump re-judges only what
 * is asked for again, and old judgements stay readable under their version.
 */
export const SENTIMENT_ANALYZER_VERSION = 1;

export const STANCES = [
	"recommended",
	"mentioned_neutral",
	"mentioned_caveated",
	"disrecommended",
	"comparison_anchor",
] as const;
export type Stance = (typeof STANCES)[number];

export const ROLES = ["primary_pick", "alternative", "listed", "comparison", "warned_against", "other"] as const;

export const judgementSchema = z.object({
	judgements: z.array(
		z.object({
			subject: z.string(),
			stance: z.enum(STANCES),
			role: z.enum(ROLES),
			// Range checked in code, not the schema: not every model's structured
			// output accepts numeric bounds.
			confidence: z.number(),
			evidence: z.string(),
		}),
	),
});
export type JudgementOutput = z.infer<typeof judgementSchema>;

export function buildSentimentPrompt(answer: string, subjects: readonly string[]): string {
	return `You judge how an AI assistant's answer treats each named brand.

Brands to judge: ${subjects.map((s) => JSON.stringify(s)).join(", ")}

For each brand, choose exactly one stance:
- recommended: the answer recommends it or favours it for the asker's need.
- mentioned_neutral: it is named without being evaluated, e.g. as one item in a list of options.
- mentioned_caveated: it is presented as an option, but with a notable limitation, drawback or condition attached.
- disrecommended: the answer advises against it, or describes it mainly negatively.
- comparison_anchor: it is used as a reference point to describe or rank other options ("like X but cheaper"), not itself put forward as the pick.

Also give its role (primary_pick, alternative, listed, comparison, warned_against or other), your confidence from 0 to 1, and evidence: a span of 10 to 30 words copied exactly, character for character, from the answer, that best supports the stance.

Return one judgement per brand listed above, using the brand name exactly as given.

Answer:
"""
${answer}
"""`;
}
