import { cacheLife, cacheTag } from "next/cache";
import { and, desc, eq, isNull } from "drizzle-orm";
import db from "@/db";
import { sources } from "./schema";

const sourceColumns = {
  id: sources.id,
  filename: sources.filename,
  status: sources.status,
  studentId: sources.studentId,
};

export async function listSources(studentId: string) {
  "use cache: private";
  cacheTag("sources");
  cacheLife("hours");

  return db
    .select(sourceColumns)
    .from(sources)
    .where(and(eq(sources.studentId, studentId), isNull(sources.deletedAt)))
    .orderBy(desc(sources.createdAt), desc(sources.id));
}

export async function insertSource(values: {
  id: string;
  studentId: string;
  filename: string;
  objectKey: string;
}) {
  const [row] = await db
    .insert(sources)
    .values(values)
    .returning(sourceColumns);

  return row;
}
