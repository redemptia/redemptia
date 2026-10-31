ALTER TABLE "perception_verdicts" ADD COLUMN "cited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "perception_verdicts" ADD COLUMN "cited_site" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "perception_verdicts" ADD COLUMN "cited_source" boolean DEFAULT false NOT NULL;--> statement-breakpoint
WITH site AS (
	SELECT b.id AS brand_id, lower(regexp_replace(regexp_replace(d, '^https?://(www\.)?', ''), '/.*$', '')) AS host
	FROM brands b, unnest(array_prepend(b.website, b.additional_domains)) AS d
),
cites AS (
	SELECT c.prompt_run_id,
		array_agg(DISTINCT lower(regexp_replace(regexp_replace(regexp_replace(c.url, '^https?://(www\.)?', ''), '[?#].*$', ''), '/+$', ''))) AS pages,
		bool_or(EXISTS (
			SELECT 1 FROM site s
			WHERE s.brand_id = c.brand_id AND (lower(regexp_replace(c.domain, '^www\.', '')) = s.host OR lower(c.domain) LIKE '%.' || s.host)
		)) AS on_site
	FROM citations c
	GROUP BY c.prompt_run_id
)
UPDATE "perception_verdicts" v
SET "cited" = true,
	"cited_site" = ci.on_site,
	"cited_source" = (f.source_url IS NOT NULL AND lower(regexp_replace(regexp_replace(regexp_replace(f.source_url, '^https?://(www\.)?', ''), '[?#].*$', ''), '/+$', '')) = ANY(ci.pages))
FROM cites ci, brand_facts f
WHERE v.kind = 'fact' AND ci.prompt_run_id = v.run_id AND f.id = v.fact_id;
