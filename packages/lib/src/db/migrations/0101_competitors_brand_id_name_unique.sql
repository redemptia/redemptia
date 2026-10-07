-- Self-hosted databases can already hold duplicate (brand_id, name) rows: nothing
-- prevented them before this constraint, and adding it over duplicates fails the
-- whole migration. Each group collapses into its oldest row (id breaks created_at
-- ties, so the choice is deterministic) and the rest are deleted. Nothing
-- references competitors.id and mentions are stored by name, so no other row
-- points at the deleted ones.
--
-- The kept row first takes the distinct union of the whole group's domains and
-- aliases. Those are what mentionsSubject matches answers on, so dropping a
-- duplicate's would silently stop counting mentions it alone caught, and this
-- can't be undone once it has run. Each value keeps its first appearance, taking
-- rows oldest first and each array in its stored order, so the result is
-- reproducible.
WITH "grouped" AS (
	SELECT "id", "domains", "aliases",
		row_number() OVER "w" AS "rank",
		first_value("id") OVER "w" AS "keep_id",
		count(*) OVER (PARTITION BY "brand_id", "name") AS "size"
	FROM "competitors"
	WINDOW "w" AS (PARTITION BY "brand_id", "name" ORDER BY "created_at", "id")
),
"domain_firsts" AS (
	SELECT DISTINCT ON ("g"."keep_id", "d"."value") "g"."keep_id", "d"."value", "g"."rank", "d"."pos"
	FROM "grouped" AS "g", unnest("g"."domains") WITH ORDINALITY AS "d"("value", "pos")
	WHERE "g"."size" > 1
	ORDER BY "g"."keep_id", "d"."value", "g"."rank", "d"."pos"
),
"alias_firsts" AS (
	SELECT DISTINCT ON ("g"."keep_id", "a"."value") "g"."keep_id", "a"."value", "g"."rank", "a"."pos"
	FROM "grouped" AS "g", unnest("g"."aliases") WITH ORDINALITY AS "a"("value", "pos")
	WHERE "g"."size" > 1
	ORDER BY "g"."keep_id", "a"."value", "g"."rank", "a"."pos"
),
"kept" AS (
	SELECT DISTINCT "keep_id" FROM "grouped" WHERE "size" > 1
)
UPDATE "competitors" AS "c"
SET
	"domains" = COALESCE(
		(SELECT array_agg("value" ORDER BY "rank", "pos") FROM "domain_firsts" WHERE "keep_id" = "c"."id"),
		'{}'
	),
	"aliases" = COALESCE(
		(SELECT array_agg("value" ORDER BY "rank", "pos") FROM "alias_firsts" WHERE "keep_id" = "c"."id"),
		'{}'
	)
FROM "kept"
WHERE "c"."id" = "kept"."keep_id";
--> statement-breakpoint
DELETE FROM "competitors" AS "dup"
USING "competitors" AS "keep"
WHERE "dup"."brand_id" = "keep"."brand_id"
	AND "dup"."name" = "keep"."name"
	AND ("keep"."created_at", "keep"."id") < ("dup"."created_at", "dup"."id");
--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_brand_id_name_unique" UNIQUE("brand_id","name");
