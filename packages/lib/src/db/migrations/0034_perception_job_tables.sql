CREATE TABLE "perception_jev_calls" (
	"organization_id" text NOT NULL,
	"day" date NOT NULL,
	"calls" integer NOT NULL,
	CONSTRAINT "perception_jev_calls_pk" PRIMARY KEY("organization_id","day")
);
--> statement-breakpoint
ALTER TABLE "perception_jev_calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "perception_rollup_dirty" (
	"brand_id" text NOT NULL,
	"day" date NOT NULL,
	"first_marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perception_rollup_dirty_pk" PRIMARY KEY("brand_id","day")
);
--> statement-breakpoint
ALTER TABLE "perception_rollup_dirty" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "perception_run_status" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"stamp" text NOT NULL,
	"outcome" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perception_run_status_outcome" CHECK (outcome IS NULL OR outcome IN ('no_text', 'too_large', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "perception_run_status" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "perception_run_status" ADD CONSTRAINT "perception_run_status_run_id_prompt_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."prompt_runs"("id") ON DELETE cascade ON UPDATE no action;