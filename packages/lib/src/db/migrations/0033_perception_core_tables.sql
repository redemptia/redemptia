CREATE TABLE "brand_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" text NOT NULL,
	"statement" text NOT NULL,
	"category" text,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"supersedes" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_facts_validity" CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
--> statement-breakpoint
ALTER TABLE "brand_facts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "perception_attribute_versions" (
	"attribute_id" uuid NOT NULL,
	"question_version" integer NOT NULL,
	"question_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perception_attribute_versions_pk" PRIMARY KEY("attribute_id","question_version")
);
--> statement-breakpoint
ALTER TABLE "perception_attribute_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "perception_attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"question_text" text NOT NULL,
	"question_version" integer DEFAULT 1 NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perception_attributes_brand_key" UNIQUE("brand_id","key")
);
--> statement-breakpoint
ALTER TABLE "perception_attributes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "perception_stamps" (
	"brand_id" text NOT NULL,
	"layer" text NOT NULL,
	"version" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perception_stamps_pk" PRIMARY KEY("brand_id","layer")
);
--> statement-breakpoint
ALTER TABLE "perception_stamps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "perception_verdicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"kind" text NOT NULL,
	"attribute_id" uuid,
	"fact_id" uuid,
	"question_version" integer,
	"verdict" text NOT NULL,
	"probabilities" jsonb NOT NULL,
	"passage" text,
	"stamp" text NOT NULL,
	"truncated_at" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perception_verdicts_judgement" UNIQUE NULLS NOT DISTINCT("run_id","subject","kind","attribute_id","fact_id","question_version","stamp"),
	CONSTRAINT "perception_verdicts_ref" CHECK ((kind = 'attribute' AND attribute_id IS NOT NULL AND fact_id IS NULL AND question_version IS NOT NULL)
			OR (kind = 'fact' AND fact_id IS NOT NULL AND attribute_id IS NULL AND question_version IS NULL)
			OR (kind = 'drift' AND attribute_id IS NULL AND fact_id IS NULL AND question_version IS NULL))
);
--> statement-breakpoint
ALTER TABLE "perception_verdicts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rollup_perception_daily" (
	"brand_id" text NOT NULL,
	"day" date NOT NULL,
	"prompt_id" uuid NOT NULL,
	"prompt_class" text NOT NULL,
	"model" text NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"subject" text NOT NULL,
	"kind" text NOT NULL,
	"ref_key" text DEFAULT '' NOT NULL,
	"question_version" integer DEFAULT 0 NOT NULL,
	"stamp" text NOT NULL,
	"verdict" text NOT NULL,
	"answers" integer NOT NULL,
	CONSTRAINT "rollup_perception_daily_pk" PRIMARY KEY("brand_id","day","prompt_id","model","provider","subject","kind","ref_key","question_version","stamp","verdict")
);
--> statement-breakpoint
ALTER TABLE "rollup_perception_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "brand_facts" ADD CONSTRAINT "brand_facts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_facts" ADD CONSTRAINT "brand_facts_supersedes_brand_facts_id_fk" FOREIGN KEY ("supersedes") REFERENCES "public"."brand_facts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perception_attribute_versions" ADD CONSTRAINT "perception_attribute_versions_attribute_id_perception_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."perception_attributes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perception_attributes" ADD CONSTRAINT "perception_attributes_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perception_stamps" ADD CONSTRAINT "perception_stamps_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perception_verdicts" ADD CONSTRAINT "perception_verdicts_run_id_prompt_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."prompt_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perception_verdicts" ADD CONSTRAINT "perception_verdicts_attribute_id_perception_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."perception_attributes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perception_verdicts" ADD CONSTRAINT "perception_verdicts_fact_id_brand_facts_id_fk" FOREIGN KEY ("fact_id") REFERENCES "public"."brand_facts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_perception_daily" ADD CONSTRAINT "rollup_perception_daily_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_facts_brand_id_idx" ON "brand_facts" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "perception_verdicts_attribute_id_idx" ON "perception_verdicts" USING btree ("attribute_id");--> statement-breakpoint
CREATE INDEX "perception_verdicts_fact_id_idx" ON "perception_verdicts" USING btree ("fact_id");--> statement-breakpoint
CREATE INDEX "rollup_perception_daily_prompt_id_day_idx" ON "rollup_perception_daily" USING btree ("prompt_id","day");--> statement-breakpoint
-- Hand-written, so drizzle doesn't track it (like 0024's prompt_runs trigger): a fact is
-- immutable once written. A change is a new row that supersedes the old one, and the old
-- row may only have valid_to set, once. Every other column is compared as a whole, so a
-- column added later is protected without editing this.
CREATE FUNCTION "brand_facts_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF (to_jsonb(NEW) - 'valid_to') IS DISTINCT FROM (to_jsonb(OLD) - 'valid_to')
		OR (OLD.valid_to IS NOT NULL AND NEW.valid_to IS DISTINCT FROM OLD.valid_to)
	THEN
		RAISE EXCEPTION 'brand_facts rows are immutable: record a change as a new fact that supersedes this one (only valid_to may be set, once)';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "brand_facts_immutable" BEFORE UPDATE ON "brand_facts"
	FOR EACH ROW EXECUTE FUNCTION "brand_facts_immutable"();
