ALTER TABLE "articles" ADD COLUMN "origin" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "pub_types" jsonb;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "scan_score" integer;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "scan_query" text;