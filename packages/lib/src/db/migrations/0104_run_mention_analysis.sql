CREATE TYPE "public"."subject_kind" AS ENUM('brand', 'competitor');--> statement-breakpoint
CREATE TABLE "run_mention_analyses" (
	"prompt_run_id" uuid PRIMARY KEY NOT NULL,
	"analyzer_version" smallint NOT NULL,
	"extractor_version" integer NOT NULL,
	"subject_fingerprint" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "run_mention_analyses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "run_subject_mentions" (
	"prompt_run_id" uuid NOT NULL,
	"subject_key" text NOT NULL,
	"subject_kind" "subject_kind" NOT NULL,
	"subject_name" text NOT NULL,
	"prompt_id" uuid NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"first_offset" integer NOT NULL,
	"position" double precision NOT NULL,
	CONSTRAINT "run_subject_mentions_prompt_run_id_subject_key_pk" PRIMARY KEY("prompt_run_id","subject_key"),
	CONSTRAINT "run_subject_mentions_first_offset_check" CHECK ("run_subject_mentions"."first_offset" >= 0),
	CONSTRAINT "run_subject_mentions_position_check" CHECK ("run_subject_mentions"."position" >= 0 AND "run_subject_mentions"."position" < 1)
);
--> statement-breakpoint
ALTER TABLE "run_subject_mentions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "run_mention_analyses" ADD CONSTRAINT "run_mention_analyses_prompt_run_id_prompt_runs_id_fk" FOREIGN KEY ("prompt_run_id") REFERENCES "public"."prompt_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_subject_mentions" ADD CONSTRAINT "run_subject_mentions_prompt_run_id_prompt_runs_id_fk" FOREIGN KEY ("prompt_run_id") REFERENCES "public"."prompt_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_subject_mentions_prompt_created_idx" ON "run_subject_mentions" USING btree ("prompt_id","created_at","subject_key","position","model","prompt_run_id","first_offset");