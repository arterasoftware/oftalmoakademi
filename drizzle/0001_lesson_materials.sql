CREATE TYPE "public"."material_kind" AS ENUM('PDF', 'IMAGE', 'MODEL3D', 'VIDEO', 'LINK');--> statement-breakpoint
ALTER TYPE "public"."file_kind" ADD VALUE 'LESSON_MATERIAL';--> statement-breakpoint
CREATE TABLE "lesson_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"kind" "material_kind" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"file_id" uuid,
	"url" text,
	"extracted_text" text,
	"order" integer DEFAULT 0 NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "interactive" jsonb;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "interactive_published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "interactive_ai_generated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "interactive_generated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lesson_materials" ADD CONSTRAINT "lesson_materials_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_materials" ADD CONSTRAINT "lesson_materials_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_materials" ADD CONSTRAINT "lesson_materials_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_materials_lesson_idx" ON "lesson_materials" USING btree ("lesson_id","order");