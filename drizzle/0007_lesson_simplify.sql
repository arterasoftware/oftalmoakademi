-- Ders modülü sadeleştirmesi (2026-11-05). Eski ders verisi korunmaz (kullanıcı kararı).
DELETE FROM "comments" WHERE "target_type" = 'LESSON';--> statement-breakpoint
DELETE FROM "lessons";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN IF EXISTS "status";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."lesson_status";--> statement-breakpoint
CREATE TYPE "public"."lesson_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "status" "lesson_status" DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN IF EXISTS "content";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN IF EXISTS "ai_generated";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN IF EXISTS "ai_model";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN IF EXISTS "reviewer_id";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN IF EXISTS "review_note";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN IF EXISTS "approved_at";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN IF EXISTS "interactive";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN IF EXISTS "interactive_published";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN IF EXISTS "interactive_ai_generated";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN IF EXISTS "interactive_generated_at";--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "notes_source" text;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "notes_model" text;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "notes_updated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lessons_status_idx" ON "lessons" USING btree ("status");--> statement-breakpoint
ALTER TYPE "public"."material_kind" ADD VALUE 'AUDIO';
