-- 0008 renamed prompt_runs."modelGroup" to "model" and the snapshot renamed this
-- index with it, but no SQL ever renamed the index itself, so every database
-- still has the old name. IF EXISTS because a database created another way may
-- already have the new one.
ALTER INDEX IF EXISTS "prompt_runs_web_search_model_group_created_at_idx" RENAME TO "prompt_runs_web_search_model_created_at_idx";--> statement-breakpoint
CREATE INDEX "prompt_runs_brand_id_created_at_idx" ON "prompt_runs" USING btree ("brand_id","created_at");