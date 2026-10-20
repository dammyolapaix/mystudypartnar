import { timestamps } from "@/db/helper";
import { users } from "@/features/auth/schema";
import { index, pgEnum, snakeCase, text, uuid } from "drizzle-orm/pg-core";

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
