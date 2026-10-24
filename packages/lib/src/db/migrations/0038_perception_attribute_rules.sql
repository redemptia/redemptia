ALTER TABLE "perception_attributes" ADD COLUMN "market_prompt_text" text NOT NULL;--> statement-breakpoint
ALTER TABLE "perception_prompts" ADD COLUMN "attribute_key" text;--> statement-breakpoint
-- Hand-written, so drizzle doesn't track it (like 0033's brand_facts trigger). All history keys on
-- an attribute's key, so the key and the brand it belongs to never change. A new question is a new
-- series: the text changes exactly when the version goes up by one. Renaming and retiring are free.
CREATE FUNCTION "perception_attributes_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id OR NEW.brand_id IS DISTINCT FROM OLD.brand_id
		OR NEW.key IS DISTINCT FROM OLD.key OR NEW.created_at IS DISTINCT FROM OLD.created_at
	THEN
		RAISE EXCEPTION 'perception_attributes: an attribute''s id, brand, key and creation time never change';
	END IF;
	IF (NEW.question_text IS DISTINCT FROM OLD.question_text) <> (NEW.question_version IS DISTINCT FROM OLD.question_version)
		OR (NEW.question_version IS DISTINCT FROM OLD.question_version AND NEW.question_version <> OLD.question_version + 1)
	THEN
		RAISE EXCEPTION 'perception_attributes: a new question_text needs question_version raised by exactly one, and the version moves only with the text';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "perception_attributes_guard" BEFORE UPDATE ON "perception_attributes"
	FOR EACH ROW EXECUTE FUNCTION "perception_attributes_guard"();--> statement-breakpoint
-- What a past series asked is permanent.
CREATE FUNCTION "perception_attribute_versions_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'perception_attribute_versions rows are immutable: a new question is a new version';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "perception_attribute_versions_immutable" BEFORE UPDATE ON "perception_attribute_versions"
	FOR EACH ROW EXECUTE FUNCTION "perception_attribute_versions_immutable"();
