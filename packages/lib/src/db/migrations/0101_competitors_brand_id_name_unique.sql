-- Self-hosted databases can already hold duplicate (brand_id, name) rows: nothing
-- prevented them before this constraint, and adding it over duplicates fails the
-- whole migration. Keep the oldest row of each group (id breaks created_at ties,
-- so the choice is deterministic) and delete the rest. Nothing references
-- competitors.id and mentions are stored by name, so no other row points at the
-- deleted ones.
DELETE FROM "competitors" AS "dup"
USING "competitors" AS "keep"
WHERE "dup"."brand_id" = "keep"."brand_id"
	AND "dup"."name" = "keep"."name"
	AND ("keep"."created_at", "keep"."id") < ("dup"."created_at", "dup"."id");
--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_brand_id_name_unique" UNIQUE("brand_id","name");
