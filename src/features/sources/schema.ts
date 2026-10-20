import { timestamps } from "@/db/helper";
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
    studentId: uuid().notNull(),
    filename: text().notNull(),
    objectKey: text().notNull().unique(),
    status: sourceStatus().notNull().default("preparing"),
    failureReason: text().notNull().default(""),
    runId: text(),
    ...timestamps,
  },
  (table) => [index("sources_student_id_idx").on(table.studentId)],
);
