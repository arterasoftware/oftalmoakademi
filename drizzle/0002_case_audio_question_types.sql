CREATE TYPE "public"."question_type" AS ENUM('MULTIPLE_CHOICE', 'MULTI_SELECT', 'TRUE_FALSE', 'MATCHING');--> statement-breakpoint
ALTER TYPE "public"."file_kind" ADD VALUE 'CASE_AUDIO';--> statement-breakpoint
CREATE TABLE "case_audio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"duration_sec" integer,
	"is_hidden_until_reveal" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "type" "question_type" DEFAULT 'MULTIPLE_CHOICE' NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "pairs" jsonb;--> statement-breakpoint
ALTER TABLE "case_audio" ADD CONSTRAINT "case_audio_case_id_clinical_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."clinical_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_audio" ADD CONSTRAINT "case_audio_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_audio" ADD CONSTRAINT "case_audio_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_audio_case_idx" ON "case_audio" USING btree ("case_id");