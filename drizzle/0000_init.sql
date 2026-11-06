CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "clauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"clause_ref" text,
	"section_path" text[],
	"heading" text,
	"text" text NOT NULL,
	"page_number" integer,
	"char_start" integer,
	"char_end" integer,
	"bbox_json" jsonb,
	"text_hash" text NOT NULL,
	"embedding" vector(768),
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "text")) STORED
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"page_count" integer,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"blob_url" text
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"clause_id" uuid,
	"playbook_rule_id" uuid,
	"risk_level" text NOT NULL,
	"deviation_reason" text,
	"source_span" text,
	"confidence" text,
	"citation_verified" boolean DEFAULT false NOT NULL,
	"retrieval_debug" jsonb,
	"model_used" text
);
--> statement-breakpoint
CREATE TABLE "playbook_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_key" text NOT NULL,
	"rule_name" text NOT NULL,
	"rule_text" text NOT NULL,
	"preferred_position" text,
	"fallback_position" text,
	"category" text,
	"embedding" vector(768),
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "rule_name" || ' ' || "rule_text")) STORED,
	CONSTRAINT "playbook_rules_rule_key_unique" UNIQUE("rule_key")
);
--> statement-breakpoint
CREATE TABLE "rerank_cache" (
	"clause_hash" text NOT NULL,
	"rule_hash" text NOT NULL,
	"score" double precision NOT NULL,
	CONSTRAINT "rerank_cache_clause_hash_rule_hash_pk" PRIMARY KEY("clause_hash","rule_hash")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider_log" jsonb DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE TABLE "rule_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(768),
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "text")) STORED
);
--> statement-breakpoint
ALTER TABLE "clauses" ADD CONSTRAINT "clauses_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_clause_id_clauses_id_fk" FOREIGN KEY ("clause_id") REFERENCES "public"."clauses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_playbook_rule_id_playbook_rules_id_fk" FOREIGN KEY ("playbook_rule_id") REFERENCES "public"."playbook_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_variants" ADD CONSTRAINT "rule_variants_rule_id_playbook_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."playbook_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clauses_document_idx" ON "clauses" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "clauses_embedding_hnsw" ON "clauses" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "clauses_tsv_gin" ON "clauses" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "findings_review_idx" ON "findings" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "playbook_rules_embedding_hnsw" ON "playbook_rules" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "playbook_rules_tsv_gin" ON "playbook_rules" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "rule_variants_rule_idx" ON "rule_variants" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "rule_variants_embedding_hnsw" ON "rule_variants" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "rule_variants_tsv_gin" ON "rule_variants" USING gin ("tsv");