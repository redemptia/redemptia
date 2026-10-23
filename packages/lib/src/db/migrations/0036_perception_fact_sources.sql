ALTER TABLE "brand_facts" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "brand_facts" ADD COLUMN "source_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "brand_facts" ADD COLUMN "source_quote" text;--> statement-breakpoint
ALTER TABLE "brand_facts" ADD CONSTRAINT "brand_facts_source" CHECK ((source_url IS NULL) = (source_read_at IS NULL) AND (source_quote IS NULL OR source_url IS NOT NULL) AND (source_url IS NULL OR source_url ~ '^https?://'));