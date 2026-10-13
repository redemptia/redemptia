-- Competitor names become unique ignoring case and surrounding whitespace, as
-- mention matching already treats them. Unlike 0101 this refuses rather than
-- merging: removing a variant deletes a competitor row, and that is an
-- operator's call. Merge each group listed by hand (keep one row, move the
-- others' domains and aliases into it, delete the rest) and run it again.
DO $$
DECLARE
	"dupes" text;
BEGIN
	SELECT string_agg(format('brand %s: %s', "brand_id", "names"), '; ') INTO "dupes"
	FROM (
		SELECT "brand_id", string_agg(quote_literal("name"), ', ' ORDER BY "name") AS "names"
		FROM "competitors"
		GROUP BY "brand_id", lower(btrim("name"))
		HAVING count(*) > 1
	) AS "groups";
	IF "dupes" IS NOT NULL THEN
		RAISE EXCEPTION 'Competitors that differ only in case or surrounding whitespace must be merged before this migration: %', "dupes";
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "competitors" DROP CONSTRAINT "competitors_brand_id_name_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "competitors_brand_id_name_unique" ON "competitors" USING btree ("brand_id",lower(btrim("name")));