CREATE TABLE "run_texts" (
	"prompt_run_id" uuid PRIMARY KEY NOT NULL,
	"text" text,
	"content_hash" text,
	"answer_length" integer,
	"extractor_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "run_texts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "run_texts" ADD CONSTRAINT "run_texts_prompt_run_id_prompt_runs_id_fk" FOREIGN KEY ("prompt_run_id") REFERENCES "public"."prompt_runs"("id") ON DELETE cascade ON UPDATE no action;