import {
  bigint,
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
import { relations, sql } from "drizzle-orm";

// Must match EMBED_DIM (768) so the HNSW index stays under pgvector's 2000-dim limit.
export const EMBED_DIM = 768;

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const bytea = customType<{ data: Buffer; driverData: string | Buffer }>({
  dataType() {
    return "bytea";
  },
  // Writes go over neon-http as hex text ("\\x..."); reads come back as a Buffer (or hex text from other drivers).
  toDriver: (v) => `\\x${v.toString("hex")}`,
  fromDriver: (v) => (Buffer.isBuffer(v) ? v : Buffer.from(String(v).replace(/^\\x/, ""), "hex")),
});

export type Bbox = { page: number; x: number; y: number; w: number; h: number };


// ---- Better Auth tables (generated with `npx @better-auth/cli generate`; do not hand-edit) ----

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  username: text("username").unique(),
  displayUsername: text("display_username"),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  pageCount: integer("page_count"),
  status: text("status").notNull().default("uploaded"),
  blobUrl: text("blob_url"),
});

/** Original upload bytes, so the review page can render the real PDF. Kept out of `documents` so list queries stay light. */
export const documentFiles = pgTable("document_files", {
  documentId: uuid("document_id")
    .primaryKey()
    .references(() => documents.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  data: bytea("data").notNull(),
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
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  progress: integer("progress").notNull().default(0),
  totalClauses: integer("total_clauses").notNull().default(0),
  error: text("error"),
  // True when the findings come from the saved demo snapshot instead of a live model run.
  cached: boolean("cached").notNull().default(false),
  // Lease held by the worker currently processing a batch; expires so a crashed worker can't strand the review.
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
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
