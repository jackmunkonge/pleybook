import {
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  vector,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Must match EMBED_DIM (768) so the HNSW index stays under pgvector's 2000-dim limit.
export const EMBED_DIM = 768;

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export type Bbox = { page: number; x: number; y: number; w: number; h: number };

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  pageCount: integer("page_count"),
  status: text("status").notNull().default("uploaded"),
  blobUrl: text("blob_url"),
});

export const clauses = pgTable(
  "clauses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    clauseRef: text("clause_ref"),
    sectionPath: text("section_path").array(),
    heading: text("heading"),
    text: text("text").notNull(),
    pageNumber: integer("page_number"),
    charStart: integer("char_start"),
    charEnd: integer("char_end"),
    bboxJson: jsonb("bbox_json").$type<Bbox[]>(),
    textHash: text("text_hash").notNull(),
    embedding: vector("embedding", { dimensions: EMBED_DIM }),
    tsv: tsvector("tsv").generatedAlwaysAs(sql`to_tsvector('english', "text")`),
  },
  (t) => [
    index("clauses_document_idx").on(t.documentId),
    index("clauses_embedding_hnsw").using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("clauses_tsv_gin").using("gin", t.tsv),
  ],
);

export const playbookRules = pgTable(
  "playbook_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleKey: text("rule_key").notNull().unique(),
    ruleName: text("rule_name").notNull(),
    ruleText: text("rule_text").notNull(),
    preferredPosition: text("preferred_position"),
    fallbackPosition: text("fallback_position"),
    category: text("category"),
    embedding: vector("embedding", { dimensions: EMBED_DIM }),
    tsv: tsvector("tsv").generatedAlwaysAs(
      sql`to_tsvector('english', "rule_name" || ' ' || "rule_text")`,
    ),
  },
  (t) => [
    index("playbook_rules_embedding_hnsw").using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("playbook_rules_tsv_gin").using("gin", t.tsv),
  ],
);

export const ruleVariants = pgTable(
  "rule_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => playbookRules.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    embedding: vector("embedding", { dimensions: EMBED_DIM }),
    tsv: tsvector("tsv").generatedAlwaysAs(sql`to_tsvector('english', "text")`),
  },
  (t) => [
    index("rule_variants_rule_idx").on(t.ruleId),
    index("rule_variants_embedding_hnsw").using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("rule_variants_tsv_gin").using("gin", t.tsv),
  ],
);

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  progress: integer("progress").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  providerLog: jsonb("provider_log").$type<unknown[]>().default(sql`'[]'::jsonb`),
});

export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    clauseId: uuid("clause_id").references(() => clauses.id, { onDelete: "cascade" }),
    playbookRuleId: uuid("playbook_rule_id").references(() => playbookRules.id),
    riskLevel: text("risk_level", { enum: ["none", "low", "medium", "high"] }).notNull(),
    deviationReason: text("deviation_reason"),
    sourceSpan: text("source_span"),
    confidence: text("confidence", { enum: ["low", "medium", "high"] }),
    citationVerified: boolean("citation_verified").notNull().default(false),
    retrievalDebug: jsonb("retrieval_debug"),
    modelUsed: text("model_used"),
  },
  (t) => [index("findings_review_idx").on(t.reviewId)],
);

export const rerankCache = pgTable(
  "rerank_cache",
  {
    clauseHash: text("clause_hash").notNull(),
    ruleHash: text("rule_hash").notNull(),
    score: doublePrecision("score").notNull(),
  },
  (t) => [primaryKey({ columns: [t.clauseHash, t.ruleHash] })],
);
