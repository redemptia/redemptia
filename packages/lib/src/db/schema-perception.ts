/**
 * Brand Perception's tables. They live apart from schema.ts so that file stays
 * identical to upstream's, which keeps migration renumbering at each catch-up
 * a clean comparison.
 */
import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	check,
	date,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	real,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { brands, promptRuns, prompts } from "./schema";

export const PERCEPTION_PROMPT_CLASSES = ["association", "market", "fact"] as const;
export type PerceptionPromptClass = (typeof PERCEPTION_PROMPT_CLASSES)[number];

export const PERCEPTION_VERDICT_KINDS = ["attribute", "fact", "drift"] as const;
export type PerceptionVerdictKind = (typeof PERCEPTION_VERDICT_KINDS)[number];

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

/**
 * A brand's attribute taxonomy. All history keys on `key`, which is opaque, never
 * shown and never reused, so a rename (`label`) changes nothing in it. Editing
 * `questionText` bumps `questionVersion` and starts a new series; the text of
 * every version is kept in `perceptionAttributeVersions`. A retired attribute
 * keeps its row, which is also what stops its key being reused.
 */
export const perceptionAttributes = pgTable(
	"perception_attributes",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		brandId: text("brand_id")
			.notNull()
			.references(() => brands.id, { onDelete: "cascade" }),
		key: text("key").notNull(),
		label: text("label").notNull(),
		/** The judge's question; `{subject}` stands for the brand's name. */
		questionText: text("question_text").notNull(),
		questionVersion: integer("question_version").notNull().default(1),
		retiredAt: timestamp("retired_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [unique("perception_attributes_brand_key").on(table.brandId, table.key)],
).enableRLS();

/** Every version of an attribute's question, so a chart can say what each series asked. */
export const perceptionAttributeVersions = pgTable(
	"perception_attribute_versions",
	{
		attributeId: uuid("attribute_id")
			.notNull()
			.references(() => perceptionAttributes.id, { onDelete: "cascade" }),
		questionVersion: integer("question_version").notNull(),
		questionText: text("question_text").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		primaryKey({ name: "perception_attribute_versions_pk", columns: [table.attributeId, table.questionVersion] }),
	],
).enableRLS();

/**
 * Ground truth the operator supplies. One assertion per row. Rows are never
 * edited: a change inserts a new row that `supersedes` the old one and closes the
 * old one's `validTo`, so an answer is always checked against what was true on
 * the day it was given. The database enforces this with a trigger written by hand
 * in migration 0033 (drizzle doesn't track triggers): only `validTo` may be set,
 * once. A fact that a later one supersedes can't be deleted on its own.
 */
export const brandFacts = pgTable(
	"brand_facts",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		brandId: text("brand_id")
			.notNull()
			.references(() => brands.id, { onDelete: "cascade" }),
		statement: text("statement").notNull(),
		category: text("category"),
		validFrom: date("valid_from").notNull(),
		/** Null while the fact is still true. */
		validTo: date("valid_to"),
		supersedes: uuid("supersedes").references((): AnyPgColumn => brandFacts.id),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("brand_facts_brand_id_idx").on(table.brandId),
		check("brand_facts_validity", sql`valid_to IS NULL OR valid_to >= valid_from`),
	],
).enableRLS();

/**
 * One judgement per (run, subject, question). `stamp` is the perception judge's
 * version plus the extractor version of the text it judged; a run has been
 * judged when it has rows at the current stamp. The unique key is what makes a
 * re-sent job harmless: the second write of the same judgement fails rather
 * than paying for, and storing, a duplicate.
 */
export const perceptionVerdicts = pgTable(
	"perception_verdicts",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		runId: uuid("run_id")
			.notNull()
			.references(() => promptRuns.id, { onDelete: "cascade" }),
		/** The brand's or competitor's name as configured when judged. */
		subject: text("subject").notNull(),
		kind: text("kind").$type<PerceptionVerdictKind>().notNull(),
		attributeId: uuid("attribute_id").references(() => perceptionAttributes.id, { onDelete: "cascade" }),
		factId: uuid("fact_id").references(() => brandFacts.id, { onDelete: "cascade" }),
		/** The attribute question's version; null for facts and drift. */
		questionVersion: integer("question_version"),
		verdict: text("verdict").notNull(),
		probabilities: jsonb("probabilities").$type<Record<string, number>>().notNull(),
		/** The judge's own confidence, which isn't its top probability. Stored, not used, until calibrated. */
		confidence: real("confidence"),
		passage: text("passage"),
		stamp: text("stamp").notNull(),
		/** The answer length the judge saw, when the answer was cut to fit; null when it saw the whole answer. */
		truncatedAt: integer("truncated_at"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		unique("perception_verdicts_judgement")
			.on(table.runId, table.subject, table.kind, table.attributeId, table.factId, table.questionVersion, table.stamp)
			.nullsNotDistinct(),
		index("perception_verdicts_attribute_id_idx").on(table.attributeId),
		index("perception_verdicts_fact_id_idx").on(table.factId),
		check(
			"perception_verdicts_ref",
			sql`(kind = 'attribute' AND attribute_id IS NOT NULL AND fact_id IS NULL AND question_version IS NOT NULL)
			OR (kind = 'fact' AND fact_id IS NOT NULL AND attribute_id IS NULL AND question_version IS NULL)
			OR (kind = 'drift' AND attribute_id IS NULL AND fact_id IS NULL AND question_version IS NULL)`,
		),
	],
).enableRLS();

/**
 * Verdict counts per UTC day, one row per verdict value. UTC rather than the
 * viewer's timezone, which elmo's 15-minute buckets follow: daily buckets need one
 * fixed zone, and these are rebuilt from `perceptionVerdicts`, which keep each
 * run's own timestamp, so a different zone later costs a rebuild and loses nothing. `refKey` is the
 * attribute's `key` or the fact's id, and empty for drift; `questionVersion` is 0
 * where there is none. Both are non-null so they can sit in the primary key, as
 * elmo's rollups do with `provider`. A judge-version change is a `stamp` change,
 * so a chart can mark it.
 */
export const rollupPerceptionDaily = pgTable(
	"rollup_perception_daily",
	{
		brandId: text("brand_id").notNull(),
		day: date("day").notNull(),
		promptId: uuid("prompt_id")
			.notNull()
			.references(() => prompts.id, { onDelete: "cascade" }),
		promptClass: text("prompt_class").$type<PerceptionPromptClass>().notNull(),
		model: text("model").notNull(),
		provider: text("provider").notNull().default(""),
		subject: text("subject").notNull(),
		kind: text("kind").$type<PerceptionVerdictKind>().notNull(),
		refKey: text("ref_key").notNull().default(""),
		questionVersion: integer("question_version").notNull().default(0),
		stamp: text("stamp").notNull(),
		verdict: text("verdict").notNull(),
		answers: integer("answers").notNull(),
	},
	(table) => [
		primaryKey({
			name: "rollup_perception_daily_pk",
			columns: [
				table.brandId,
				table.day,
				table.promptId,
				table.model,
				table.provider,
				table.subject,
				table.kind,
				table.refKey,
				table.questionVersion,
				table.stamp,
				table.verdict,
			],
		}),
		index("rollup_perception_daily_prompt_id_day_idx").on(table.promptId, table.day),
	],
).enableRLS();

/** Perception's own version stamps per brand and layer, never `brands.analysis_versions`. */
export const perceptionStamps = pgTable(
	"perception_stamps",
	{
		brandId: text("brand_id")
			.notNull()
			.references(() => brands.id, { onDelete: "cascade" }),
		layer: text("layer").notNull(),
		version: text("version").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [primaryKey({ name: "perception_stamps_pk", columns: [table.brandId, table.layer] })],
).enableRLS();

export const PERCEPTION_RUN_OUTCOMES = ["no_text", "too_large", "failed"] as const;
export type PerceptionRunOutcome = (typeof PERCEPTION_RUN_OUTCOMES)[number];

/**
 * Jev calls the perception job has made per organization per UTC day, counted
 * before each call is sent. A call is made only if one statement raises the count
 * while it is below the ceiling, so concurrent workers can't overshoot it.
 */
export const perceptionJevCalls = pgTable(
	"perception_jev_calls",
	{
		organizationId: text("organization_id").notNull(),
		day: date("day").notNull(),
		calls: integer("calls").notNull(),
	},
	(table) => [primaryKey({ name: "perception_jev_calls_pk", columns: [table.organizationId, table.day] })],
).enableRLS();

/**
 * A run the job has finished with but that has no verdict to show for it: no text
 * to judge, too long for the judge even when cut, or failing past its attempts.
 * Without it, such a run would be found and retried on every scan. A row whose
 * `stamp` isn't the current one no longer counts, so a new judge or extractor
 * version tries again.
 */
export const perceptionRunStatus = pgTable(
	"perception_run_status",
	{
		runId: uuid("run_id")
			.primaryKey()
			.references(() => promptRuns.id, { onDelete: "cascade" }),
		stamp: text("stamp").notNull(),
		outcome: text("outcome").$type<PerceptionRunOutcome>(),
		attempts: integer("attempts").notNull().default(0),
		lastError: text("last_error"),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	() => [check("perception_run_status_outcome", sql`outcome IS NULL OR outcome IN ('no_text', 'too_large', 'failed')`)],
).enableRLS();

/** Days whose `rollupPerceptionDaily` rows are out of date with the verdicts. */
export const perceptionRollupDirty = pgTable(
	"perception_rollup_dirty",
	{
		brandId: text("brand_id").notNull(),
		day: date("day").notNull(),
		firstMarkedAt: timestamp("first_marked_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [primaryKey({ name: "perception_rollup_dirty_pk", columns: [table.brandId, table.day] })],
).enableRLS();
