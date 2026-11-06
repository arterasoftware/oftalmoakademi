ALTER TYPE "public"."file_kind" ADD VALUE 'COMMENT_AUDIO';--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "audio_file_id" uuid;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "audio_duration_sec" integer;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_audio_file_id_files_id_fk" FOREIGN KEY ("audio_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;