DROP INDEX "citations_brand_created_analytics_idx";--> statement-breakpoint
DROP INDEX "citations_domain_idx";--> statement-breakpoint
DROP INDEX "cited_pages_domain_idx";--> statement-breakpoint
DROP INDEX "prompt_runs_web_search_created_at_idx";--> statement-breakpoint
DROP INDEX "prompt_runs_web_search_model_created_at_idx";--> statement-breakpoint
DROP INDEX "prompt_runs_provider_idx";--> statement-breakpoint
DROP INDEX "prompt_runs_model_created_at_idx";--> statement-breakpoint
CREATE INDEX "competitors_brand_id_idx" ON "competitors" USING btree ("brand_id");