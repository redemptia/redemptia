CREATE TABLE "perception_brand_settings" (
	"brand_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "perception_brand_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "perception_verdicts" DROP CONSTRAINT "perception_verdicts_fact_id_brand_facts_id_fk";
--> statement-breakpoint
ALTER TABLE "perception_brand_settings" ADD CONSTRAINT "perception_brand_settings_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perception_verdicts" ADD CONSTRAINT "perception_verdicts_fact_id_brand_facts_id_fk" FOREIGN KEY ("fact_id") REFERENCES "public"."brand_facts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brand_facts_supersedes_unique" ON "brand_facts" USING btree ("supersedes");