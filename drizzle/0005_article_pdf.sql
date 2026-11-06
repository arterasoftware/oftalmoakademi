ALTER TYPE "public"."file_kind" ADD VALUE 'ARTICLE_PDF';--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "pdf_file_id" uuid;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_pdf_file_id_files_id_fk" FOREIGN KEY ("pdf_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;