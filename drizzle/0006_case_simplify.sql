-- Olgu modülü sadeleştirmesi (2026-11-05). Eski olgu verisi korunmaz (kullanıcı kararı).
DELETE FROM "comments" WHERE "target_type" = 'CASE';--> statement-breakpoint
DROP TABLE IF EXISTS "case_audio" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "case_images" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "clinical_cases" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "public"."case_status";--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('PUBLISHED', 'HIDDEN');--> statement-breakpoint
ALTER TYPE "public"."file_kind" ADD VALUE 'COMMENT_IMAGE';--> statement-breakpoint
CREATE TABLE "clinical_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"subspecialty" "subspecialty" NOT NULL,
	"status" "case_status" DEFAULT 'PUBLISHED' NOT NULL,
	"body" text NOT NULL,
	"audio_file_id" uuid,
	"audio_duration_sec" integer,
	"deidentification_confirmed" boolean DEFAULT false NOT NULL,
	"author_id" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ai_summary" text,
	"discussion_locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"caption" text,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinical_cases" ADD CONSTRAINT "clinical_cases_audio_file_id_files_id_fk" FOREIGN KEY ("audio_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_cases" ADD CONSTRAINT "clinical_cases_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_images" ADD CONSTRAINT "case_images_case_id_clinical_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."clinical_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_images" ADD CONSTRAINT "case_images_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_images" ADD CONSTRAINT "comment_images_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_images" ADD CONSTRAINT "comment_images_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cases_status_idx" ON "clinical_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cases_author_idx" ON "clinical_cases" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "case_images_case_idx" ON "case_images" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "comment_images_comment_idx" ON "comment_images" USING btree ("comment_id");
