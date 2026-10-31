CREATE TABLE "rollup_prominence_daily" (
	"brand_id" text NOT NULL,
	"day" date NOT NULL,
	"prompt_id" uuid NOT NULL,
	"attribute_key" text NOT NULL,
	"model" text NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"subject_name" text NOT NULL,
	"competitor_set_fingerprint" text NOT NULL,
	"answers" integer NOT NULL,
	"mentioned_answers" integer NOT NULL,
	"positioned_answers" integer NOT NULL,
	"position_sum" integer NOT NULL,
	"inverse_position_sum" real NOT NULL,
	CONSTRAINT "rollup_prominence_daily_pk" PRIMARY KEY("brand_id","day","prompt_id","model","provider","subject_name","competitor_set_fingerprint")
);
--> statement-breakpoint
ALTER TABLE "rollup_prominence_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rollup_prominence_daily" ADD CONSTRAINT "rollup_prominence_daily_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rollup_prominence_daily_brand_id_day_idx" ON "rollup_prominence_daily" USING btree ("brand_id","day");