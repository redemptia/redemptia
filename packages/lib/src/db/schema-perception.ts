/**
 * Brand Perception's tables. They live apart from schema.ts so that file stays
 * identical to upstream's, which keeps migration renumbering at each catch-up
 * a clean comparison.
 */
import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { prompts } from "./schema";

export const PERCEPTION_PROMPT_CLASSES = ["association", "market", "fact"] as const;
export type PerceptionPromptClass = (typeof PERCEPTION_PROMPT_CLASSES)[number];

/**
 * Marks a prompt as a perception prompt. Headline metrics (visibility, share of
 * voice, position, sentiment, the overview cards and the Opportunities digest)
 * leave these prompts out; the evidence surfaces (citations, query fan-out,
 * responses) keep them.
 *
 * A side table rather than `prompts.system_tags` or `prompts.tags`: the first is
 * rewritten from the prompt text by every prompt save and by the worker's
 * reprocess pass, and users can delete the second.
 */
export const perceptionPrompts = pgTable(
	"perception_prompts",
	{
		promptId: uuid("prompt_id")
			.primaryKey()
			.references(() => prompts.id, { onDelete: "cascade" }),
		class: text("class").$type<PerceptionPromptClass>().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	() => [check("perception_prompts_class", sql`class IN ('association', 'market', 'fact')`)],
).enableRLS();
