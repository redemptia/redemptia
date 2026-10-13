CREATE TYPE "public"."stance" AS ENUM('recommended', 'mentioned_neutral', 'mentioned_caveated', 'disrecommended', 'comparison_anchor');--> statement-breakpoint
CREATE TYPE "public"."stance_judgement_status" AS ENUM('pending', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "stance_judgements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_hash" text NOT NULL,
	"subject_name" text NOT NULL,
	"analyzer_version" smallint NOT NULL,
	"analyzer_model" text NOT NULL,
	"status" "stance_judgement_status" NOT NULL,
	"stance" "stance",
	"role" text,
	"confidence" double precision,
	"evidence" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stance_judgements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "stance_judgements_key" ON "stance_judgements" USING btree ("content_hash",lower(btrim("subject_name")),"analyzer_version");