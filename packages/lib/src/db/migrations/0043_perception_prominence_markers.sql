CREATE TABLE "perception_prominence_dirty" (
	"brand_id" text NOT NULL,
	"day" date NOT NULL,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perception_prominence_dirty_pk" PRIMARY KEY("brand_id","day")
);
--> statement-breakpoint
ALTER TABLE "perception_prominence_dirty" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "perception_rollup_dirty" ADD COLUMN "marked_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE FUNCTION perception_mark_prominence_dirty() RETURNS trigger AS $$
BEGIN
	INSERT INTO perception_prominence_dirty (brand_id, day)
	SELECT r.brand_id, (r.created_at AT TIME ZONE 'UTC')::date
	FROM new_rows n
	JOIN prompt_runs r ON r.id = n.run_id
	JOIN perception_prompts pp ON pp.prompt_id = r.prompt_id AND pp.class = 'market'
	GROUP BY r.brand_id, (r.created_at AT TIME ZONE 'UTC')::date
	ON CONFLICT (brand_id, day) DO UPDATE SET marked_at = clock_timestamp();
	RETURN NULL;
END
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER perception_run_mentions_mark_prominence_insert
AFTER INSERT ON run_mentions
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION perception_mark_prominence_dirty();
--> statement-breakpoint
CREATE TRIGGER perception_run_mentions_mark_prominence_update
AFTER UPDATE ON run_mentions
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION perception_mark_prominence_dirty();
--> statement-breakpoint
INSERT INTO perception_prominence_dirty (brand_id, day)
SELECT DISTINCT r.brand_id, (r.created_at AT TIME ZONE 'UTC')::date
FROM run_mentions m
JOIN prompt_runs r ON r.id = m.run_id
JOIN perception_prompts pp ON pp.prompt_id = r.prompt_id AND pp.class = 'market'
WHERE m.assessments IS NOT NULL AND r.created_at >= now() - interval '90 days'
ON CONFLICT (brand_id, day) DO NOTHING;
