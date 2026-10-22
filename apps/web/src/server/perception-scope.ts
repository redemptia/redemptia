import { prompts } from "@workspace/lib/db/schema";
import { perceptionPrompts } from "@workspace/lib/db/schema-perception";
import { type SQL, sql } from "drizzle-orm";

/**
 * The condition a query over `prompts` adds to leave out perception prompts.
 * Exclusion is the default so that any headline read added later leaves them
 * out without anyone remembering to; only the evidence surfaces (citations,
 * query fan-out, responses) pass `includePerception`.
 */
export function perceptionPromptScope(includePerception = false): SQL | undefined {
	if (includePerception) return undefined;
	return sql`not exists (select 1 from ${perceptionPrompts} where ${perceptionPrompts.promptId} = ${prompts.id})`;
}
