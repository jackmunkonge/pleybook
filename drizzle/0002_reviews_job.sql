ALTER TABLE "reviews" ADD COLUMN "total_clauses" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "error" text;