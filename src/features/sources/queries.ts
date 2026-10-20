import { cacheLife, cacheTag } from "next/cache";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import db from "@/db";
import { passages, sources } from "./schema";
import type { PassageRecord } from "./types";

const sourceColumns = {
  id: sources.id,
  filename: sources.filename,
  status: sources.status,
  failureReason: sources.failureReason,
  runId: sources.runId,
  userId: sources.userId,
};

export async function listSources(userId: string) {
  "use cache: private";
  cacheTag("sources");
  cacheLife("hours");

  return db
    .select(sourceColumns)
    .from(sources)
    .where(and(eq(sources.userId, userId), isNull(sources.deletedAt)))
    .orderBy(desc(sources.createdAt), desc(sources.id));
}

export async function insertSource(values: {
  id: string;
  userId: string;
  filename: string;
  objectKey: string;
}) {
  const [row] = await db
    .insert(sources)
    .values(values)
    .returning(sourceColumns);

  return row;
}

export async function listPassages(
  userId: string,
  sourceId: string,
  options: { includeDeleted?: boolean } = {},
): Promise<PassageRecord[]> {
  "use cache: private";
  cacheTag("sources");
  cacheLife("hours");

  return db
    .select({
      page: passages.page,
      order: passages.passageOrder,
      text: passages.text,
      embedding: passages.embedding,
    })
    .from(passages)
    .innerJoin(sources, eq(passages.sourceId, sources.id))
    .where(
      and(
        eq(sources.id, sourceId),
        eq(sources.userId, userId),
        options.includeDeleted ? undefined : isNull(sources.deletedAt),
      ),
    )
    .orderBy(asc(passages.page), asc(passages.passageOrder));
}

export async function getOwnedSourceByRun(userId: string, runId: string) {
  "use cache: private";
  cacheTag("sources");
  cacheLife("hours");

  const [row] = await db
    .select(sourceColumns)
    .from(sources)
    .where(
      and(
        eq(sources.userId, userId),
        eq(sources.runId, runId),
        isNull(sources.deletedAt),
      ),
    );

  return row ?? null;
}

export async function getSourceIdByObjectKey(
  objectKey: string,
  options: { includeDeleted: boolean },
) {
  const [row] = await db
    .select({ id: sources.id })
    .from(sources)
    .where(
      options.includeDeleted
        ? eq(sources.objectKey, objectKey)
        : and(eq(sources.objectKey, objectKey), isNull(sources.deletedAt)),
    );

  return row?.id ?? null;
}

export async function getSourceForPreparation(sourceId: string) {
  const [row] = await db
    .select({
      id: sources.id,
      userId: sources.userId,
      filename: sources.filename,
      objectKey: sources.objectKey,
      status: sources.status,
      deletedAt: sources.deletedAt,
      runId: sources.runId,
    })
    .from(sources)
    .where(eq(sources.id, sourceId));

  return row ?? null;
}

export async function reopenFailedSource(
  userId: string,
  sourceId: string,
  runId: string,
) {
  return db.transaction(async (tx) => {
    const [source] = await tx
      .select({
        status: sources.status,
        userId: sources.userId,
        deletedAt: sources.deletedAt,
      })
      .from(sources)
      .where(eq(sources.id, sourceId))
      .for("update");

    if (!source || source.deletedAt || source.userId !== userId) {
      return "missing" as const;
    }
    if (source.status === "ready") return "ready" as const;
    if (source.status !== "failed") return "unavailable" as const;

    await tx.delete(passages).where(eq(passages.sourceId, sourceId));
    const [row] = await tx
      .update(sources)
      .set({ status: "preparing", failureReason: "", runId })
      .where(eq(sources.id, sourceId))
      .returning(sourceColumns);

    if (!row) return "unavailable" as const;
    return { source: row };
  });
}

export async function setSourceRunId(sourceId: string, runId: string | null) {
  const [row] = await db
    .update(sources)
    .set({ runId })
    .where(
      and(
        eq(sources.id, sourceId),
        eq(sources.status, "preparing"),
        isNull(sources.deletedAt),
      ),
    )
    .returning(sourceColumns);

  return row ?? null;
}

export async function markSourceFailed(
  sourceId: string,
  failureReason: "could_not_open" | "no_text" | "embedding_failed",
  runId?: string,
) {
  return db.transaction(async (tx) => {
    const [source] = await tx
      .select({
        status: sources.status,
        deletedAt: sources.deletedAt,
        runId: sources.runId,
      })
      .from(sources)
      .where(eq(sources.id, sourceId))
      .for("update");

    if (!source || source.deletedAt || source.status !== "preparing") {
      return "discarded" as const;
    }
    if (runId && source.runId && source.runId !== runId) {
      return "discarded" as const;
    }

    await tx.delete(passages).where(eq(passages.sourceId, sourceId));
    await tx
      .update(sources)
      .set({ status: "failed", failureReason })
      .where(eq(sources.id, sourceId));

    return "failed" as const;
  });
}

export async function commitPreparation(
  sourceId: string,
  rows: PassageRecord[],
) {
  return db.transaction(async (tx) => {
    const [source] = await tx
      .select({ status: sources.status, deletedAt: sources.deletedAt })
      .from(sources)
      .where(eq(sources.id, sourceId))
      .for("update");

    if (!source || source.deletedAt || source.status !== "preparing") {
      return "discarded" as const;
    }

    await tx.delete(passages).where(eq(passages.sourceId, sourceId));
    if (rows.length > 0) {
      await tx.insert(passages).values(
        rows.map((row) => ({
          sourceId,
          page: row.page,
          passageOrder: row.order,
          text: row.text,
          embedding: row.embedding,
        })),
      );
    }
    await tx
      .update(sources)
      .set({ status: "ready", failureReason: "" })
      .where(eq(sources.id, sourceId));

    return "ready" as const;
  });
}

export async function deleteSourcesForUser(userId: string) {
  return db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: sources.id, objectKey: sources.objectKey })
      .from(sources)
      .where(eq(sources.userId, userId))
      .for("update");

    if (owned.length === 0) return owned;

    await tx.delete(passages).where(
      inArray(
        passages.sourceId,
        owned.map((row) => row.id),
      ),
    );
    await tx
      .update(sources)
      .set({ deletedAt: new Date().toISOString() })
      .where(and(eq(sources.userId, userId), isNull(sources.deletedAt)));

    return owned;
  });
}

export async function deleteOwnedSource(userId: string, sourceId: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(sources)
      .set({ deletedAt: new Date().toISOString() })
      .where(
        and(
          eq(sources.id, sourceId),
          eq(sources.userId, userId),
          isNull(sources.deletedAt),
        ),
      )
      .returning({ id: sources.id });

    if (!row) return null;

    await tx.delete(passages).where(eq(passages.sourceId, sourceId));
    return row;
  });
}
