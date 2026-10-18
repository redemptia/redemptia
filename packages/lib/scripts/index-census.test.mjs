import assert from "node:assert/strict";
import { test } from "node:test";
import { RAW_INDEXES, snapshotIndexNames, snapshotMismatches, unexplainedDrops } from "./index-census.mjs";

const before = new Map([
	["idx_prompt_runs_brand_analytics", "prompt_runs"],
	["prompt_runs_created_at_idx", "prompt_runs"],
	["old_reports_idx", "old_reports"],
]);

test("an index lost to a dropped column is reported, since the SQL never names it", () => {
	const after = new Map([["prompt_runs_created_at_idx", "prompt_runs"]]);
	const upgrade = ['ALTER TABLE "prompt_runs" DROP COLUMN "brand_mentioned";', 'DROP TABLE "old_reports";'];
	assert.deepEqual(unexplainedDrops(before, after, upgrade), ["prompt_runs.idx_prompt_runs_brand_analytics"]);
});

test("an index the upgrade drops, renames or removes with its constraint is accounted for", () => {
	const after = new Map([["prompt_runs_created_at_idx", "prompt_runs"]]);
	for (const statement of [
		'DROP INDEX IF EXISTS "idx_prompt_runs_brand_analytics";',
		"drop index concurrently public.idx_prompt_runs_brand_analytics;",
		'ALTER INDEX "idx_prompt_runs_brand_analytics" RENAME TO "x";',
		'ALTER TABLE "prompt_runs" DROP CONSTRAINT "idx_prompt_runs_brand_analytics";',
	]) {
		assert.deepEqual(unexplainedDrops(before, after, [statement, 'DROP TABLE "old_reports";']), [], statement);
	}
});

test("a name that only contains the lost index's name doesn't account for it", () => {
	const after = new Map([["prompt_runs_created_at_idx", "prompt_runs"]]);
	const upgrade = ['DROP INDEX "idx_prompt_runs_brand_analytics_v2";', 'DROP TABLE "old_reports";'];
	assert.deepEqual(unexplainedDrops(before, after, upgrade), ["prompt_runs.idx_prompt_runs_brand_analytics"]);
});

test("the snapshot's indexes, unique constraints and primary keys are all expected", () => {
	const names = snapshotIndexNames({
		tables: {
			"public.runs": {
				name: "runs",
				columns: { id: { name: "id", primaryKey: true }, slug: { name: "slug", isUnique: true } },
				indexes: { runs_created_at_idx: {} },
				uniqueConstraints: { runs_brand_slug_unique: {} },
				compositePrimaryKeys: {},
			},
		},
	});
	assert.deepEqual([...names].sort(), [
		"runs_brand_slug_unique",
		"runs_created_at_idx",
		"runs_pkey",
		"runs_slug_unique",
	]);
});

test("a renamed index shows on both sides, and a raw index must still exist", () => {
	const raw = Object.keys(RAW_INDEXES);
	const database = new Set(["runs_pkey", "runs_model_group_idx", ...raw.slice(1)]);
	assert.deepEqual(snapshotMismatches(new Set(["runs_pkey", "runs_model_idx"]), database), {
		missing: [raw[0], "runs_model_idx"].sort(),
		unexpected: ["runs_model_group_idx"],
	});
});
