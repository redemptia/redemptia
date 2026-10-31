CREATE TABLE "mention_judge_calls" (
	"organization_id" text NOT NULL,
	"day" date NOT NULL,
	"calls" integer NOT NULL,
	CONSTRAINT "mention_judge_calls_pk" PRIMARY KEY("organization_id","day")
);
--> statement-breakpoint
ALTER TABLE "mention_judge_calls" ENABLE ROW LEVEL SECURITY;