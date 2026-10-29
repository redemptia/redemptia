-- Read-only. Run against the TARGET database: psql "$TARGET_URL" -v stamp="'perception-2+<JEV_MODEL>+extractor-1'" -f first-job-count.sql
-- Perception job: runs it would pick up at the real stamp (enabled brands only, last 30 days).
WITH eligible AS (
  SELECT pr.id, pp.class, pr.brand_id, length(pr.raw_output::text) AS raw_chars
  FROM prompt_runs pr
  JOIN perception_prompts pp ON pp.prompt_id = pr.prompt_id AND pp.class IN ('fact','association')
  JOIN perception_brand_settings s ON s.brand_id = pr.brand_id AND s.enabled
  LEFT JOIN perception_run_status st ON st.run_id = pr.id AND st.stamp = :stamp
  WHERE pr.created_at >= now() - interval '30 days' AND st.outcome IS NULL
    AND ((pp.class = 'fact' AND EXISTS (SELECT 1 FROM brand_facts f WHERE f.brand_id = pr.brand_id
            AND f.valid_from <= (pr.created_at AT TIME ZONE 'UTC')::date
            AND (f.valid_to IS NULL OR f.valid_to >= (pr.created_at AT TIME ZONE 'UTC')::date)))
      OR (pp.class = 'association' AND EXISTS (SELECT 1 FROM perception_attributes a WHERE a.brand_id = pr.brand_id AND a.retired_at IS NULL)))
    AND NOT EXISTS (SELECT 1 FROM perception_verdicts v WHERE v.run_id = pr.id AND v.stamp = :stamp)
)
SELECT class, count(*) AS runs, round(avg(raw_chars)) AS avg_raw_chars FROM eligible GROUP BY class;
-- Elmo's judge: runs already judged by the stub (re-judged by a real key).
SELECT count(*) FILTER (WHERE rm.stamp ILIKE '%stub%') AS stub_judged_runs,
       count(*) FILTER (WHERE rm.run_id IS NULL)       AS unjudged_runs
FROM prompt_runs pr LEFT JOIN run_mentions rm ON rm.run_id = pr.id
WHERE pr.created_at >= now() - interval '90 days';
