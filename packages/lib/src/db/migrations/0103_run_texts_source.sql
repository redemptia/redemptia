CREATE TYPE "public"."run_text_source" AS ENUM('live', 'backfill');--> statement-breakpoint
-- Every row that exists before this migration was written by the worker as it
-- saved the run (the backfill ships with this column), so they are all "live".
-- The default only fills them in; it is dropped so every writer must say which
-- it is.
ALTER TABLE "run_texts" ADD COLUMN "source" "run_text_source" NOT NULL DEFAULT 'live';--> statement-breakpoint
ALTER TABLE "run_texts" ALTER COLUMN "source" DROP DEFAULT;
