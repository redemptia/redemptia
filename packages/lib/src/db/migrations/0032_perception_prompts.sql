CREATE TABLE "perception_prompts" (
	"prompt_id" uuid PRIMARY KEY NOT NULL,
	"class" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perception_prompts_class" CHECK (class IN ('association', 'market', 'fact'))
);
--> statement-breakpoint
ALTER TABLE "perception_prompts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "perception_prompts" ADD CONSTRAINT "perception_prompts_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;