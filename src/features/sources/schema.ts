import { timestamps } from "@/db/helper";
import { users } from "@/features/auth/schema";
import {
  index,
  integer,
  pgEnum,
  snakeCase,
  text,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export const sourceStatus = pgEnum("source_status", [
  "preparing",
  "ready",
  "failed",
]);

export const sources = snakeCase.table(
  "sources",
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    filename: text().notNull(),
    objectKey: text().notNull().unique(),
    status: sourceStatus().notNull().default("preparing"),
    failureReason: text().notNull().default(""),
    runId: text(),
    ...timestamps,
  },
  (table) => [index("sources_user_id_idx").on(table.userId)],
);

export const passages = snakeCase.table(
  "passages",
  {
    id: uuid().defaultRandom().primaryKey(),
    sourceId: uuid()
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    page: integer().notNull(),
    passageOrder: integer().notNull(),
    text: text().notNull(),
    embedding: vector({ dimensions: 1536 }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("passages_source_page_order_idx").on(
      table.sourceId,
      table.page,
      table.passageOrder,
    ),
    index("passages_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);
