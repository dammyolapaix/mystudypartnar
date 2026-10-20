import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { rm } from "node:fs/promises";
import {
  commitPreparation,
  deleteOwnedSource,
  deleteSourcesForUser,
  getOwnedSourceByRun,
  getSourceForPreparation,
  getSourceIdByObjectKey,
  insertSource,
  markSourceFailed,
  reopenFailedSource,
  setSourceRunId,
} from "./queries";
import type {
  AbandonedUpload,
  ConvertedOfficePdf,
  OfficeExtension,
  PdfPageText,
  PreparationEvent,
  RunChannel,
  SourceCaller,
  SourceRecord,
  SourceStorage,
  UploadGrant,
} from "./types";
import {
  MAX_SOURCE_BYTES,
  sourceBytesMatch,
  sourceExtension,
  sourceObjectKey,
  splitPage,
  UPLOAD_URL_SECONDS,
} from "./utils";

export type { SourceStorage } from "./types";
export { listPassages, listSources } from "./queries";

const EMBEDDING_DIMENSIONS = 1536;

type SourcesDependencies = {
  storage: SourceStorage;
  now?: () => number;
  secret?: string;
  extractPdf?: (bytes: Uint8Array) => Promise<PdfPageText[]>;
  convertOffice?: (
    bytes: Uint8Array,
    extension: OfficeExtension,
  ) => Promise<ConvertedOfficePdf>;
  embedPassages?: (texts: string[]) => Promise<number[][]>;
  startPreparation?: (sourceId: string) => Promise<string | null>;
  scheduleAbandonedUpload?: (upload: AbandonedUpload) => Promise<void>;
  runs?: RunChannel;
};

type PendingUpload = {
  sourceId: string;
  userId: string;
  filename: string;
  objectKey: string;
  byteLength: number;
  exp: number;
};

type UploadRefusal = { error: string };
type ConfirmedSource = { source: SourceRecord };

export function createSources({
  storage,
  now = Date.now,
  secret,
  extractPdf,
  convertOffice,
  embedPassages,
  startPreparation,
  scheduleAbandonedUpload,
  runs,
}: SourcesDependencies) {
  const signingSecret = () => secret ?? requiredSecret();

  return {
    async requestUpload(
      caller: SourceCaller,
      input: { filename: string; byteLength: number },
    ): Promise<UploadGrant | UploadRefusal> {
      if (!caller) return { error: "Not authenticated" };

      const extension = sourceExtension(input.filename);
      if (!extension) return { error: "This file type is not allowed" };
      if (!Number.isSafeInteger(input.byteLength) || input.byteLength <= 0) {
        return { error: "File is empty" };
      }
      if (input.byteLength > MAX_SOURCE_BYTES) {
        return { error: "File is over 50 MB" };
      }

      const sourceId = randomUUID();
      const objectKey = sourceObjectKey(caller.id, sourceId);
      const signed = await storage.createUploadUrl({
        key: objectKey,
        contentLength: input.byteLength,
        expiresInSeconds: UPLOAD_URL_SECONDS,
      });
      const exp = now() + signed.expiresInSeconds * 1000;
      if (scheduleAbandonedUpload) {
        await scheduleAbandonedUpload({ objectKey, expiresAt: exp });
      }

      return {
        sourceId,
        uploadUrl: signed.url,
        expiresInSeconds: signed.expiresInSeconds,
        contentLength: input.byteLength,
        confirmation: signUpload(
          {
            sourceId,
            userId: caller.id,
            filename: input.filename,
            objectKey,
            byteLength: input.byteLength,
            exp,
          },
          signingSecret(),
        ),
      };
    },

    async confirmUpload(
      caller: SourceCaller,
      input: { confirmation: string },
    ): Promise<ConfirmedSource | UploadRefusal> {
      if (!caller) return { error: "Not authenticated" };

      const pending = readUpload(input.confirmation, signingSecret());
      if (pending === "invalid") return { error: "This upload was not found" };
      if (pending.userId !== caller.id) {
        return { error: "This upload was not found" };
      }
      if (now() >= pending.exp) return { error: "This upload has expired" };

      const extension = sourceExtension(pending.filename);
      if (
        !extension ||
        pending.objectKey !== sourceObjectKey(pending.userId, pending.sourceId) ||
        !Number.isSafeInteger(pending.byteLength) ||
        pending.byteLength <= 0 ||
        pending.byteLength > MAX_SOURCE_BYTES
      ) {
        return { error: "This upload was not found" };
      }

      const stat = await storage.statObject(pending.objectKey);
      if (!stat) return { error: "This upload was not found" };
      if (stat.contentLength <= 0) return { error: "File is empty" };
      if (stat.contentLength > MAX_SOURCE_BYTES) {
        return { error: "File is over 50 MB" };
      }
      if (stat.contentLength !== pending.byteLength) {
        return { error: "The uploaded file does not match" };
      }

      const bytes = await storage.readObject(pending.objectKey);
      if (!bytes || bytes.byteLength !== stat.contentLength) {
        return { error: "The uploaded file does not match" };
      }
      if (!sourceBytesMatch(extension, bytes)) {
        return { error: "This file does not match its type" };
      }

      try {
        const source = await insertSource({
          id: pending.sourceId,
          userId: pending.userId,
          filename: pending.filename,
          objectKey: pending.objectKey,
        });
        if (!source) return { error: "This upload was not found" };
        if (startPreparation) {
          const runId = await startPreparation(source.id);
          if (runId) await setSourceRunId(source.id, runId);
        }
        return { source };
      } catch (error) {
        if (isUniqueViolation(error)) {
          return { error: "This upload was already saved" };
        }
        throw error;
      }
    },

    async prepare(sourceId: string) {
      const source = await getSourceForPreparation(sourceId);
      if (!source || source.deletedAt || source.status !== "preparing") return;

      const extension = sourceExtension(source.filename);
      if (!extension) return;
      if (!extractPdf || !embedPassages) {
        throw new Error("PDF preparation is not configured");
      }

      await notify(runs, source.runId, { type: "step", name: "extracting text" });

      let temporaryPdf: string | undefined;
      try {
        let bytes: Uint8Array | null;
        try {
          bytes = await storage.readObject(source.objectKey);
        } catch {
          await markSourceFailed(sourceId, "could_not_open");
          return;
        }
        if (!bytes) {
          await markSourceFailed(sourceId, "could_not_open");
          return;
        }

        let pdfBytes = bytes;
        if (extension !== "pdf") {
          if (!convertOffice) {
            throw new Error("Office preparation is not configured");
          }
          try {
            const converted = await convertOffice(bytes, extension);
            temporaryPdf = converted.path;
            pdfBytes = converted.pdf;
          } catch {
            await markSourceFailed(sourceId, "could_not_open");
            return;
          }
        }

        let pages: PdfPageText[];
        try {
          pages = await extractPdf(pdfBytes);
        } catch {
          await markSourceFailed(sourceId, "could_not_open");
          return;
        }

        await notify(runs, source.runId, {
          type: "step",
          name: "splitting passages",
        });

        const nextPassages = pages.flatMap((page) => {
          if (!Number.isInteger(page.page) || page.page < 1) return [];
          return splitPage(page.text).map((text, index) => ({
            page: page.page,
            order: index + 1,
            text,
          }));
        });
        if (nextPassages.length === 0) {
          await markSourceFailed(sourceId, "no_text");
          return;
        }

        await notify(runs, source.runId, { type: "step", name: "embedding" });

        const embeddings = await embedPassages(
          nextPassages.map((passage) => passage.text),
        );
        if (
          embeddings.length !== nextPassages.length ||
          embeddings.some((value) => value.length !== EMBEDDING_DIMENSIONS)
        ) {
          throw new Error("Embeddings do not match the passages");
        }

        await commitPreparation(
          sourceId,
          nextPassages.map((passage, index) => {
            const embedding = embeddings[index];
            if (!embedding) throw new Error("Embeddings do not match the passages");
            return { ...passage, embedding };
          }),
        );
      } finally {
        if (temporaryPdf) await discardTemporaryPdf(temporaryPdf);
      }
    },

    async recordEmbeddingFailure(sourceId: string, runId?: string) {
      await markSourceFailed(sourceId, "embedding_failed", runId);
    },

    async retry(caller: SourceCaller, sourceId: string) {
      if (!caller) return { error: "Not authenticated" };

      const reopened = await reopenFailedSource(
        caller.id,
        sourceId,
        randomUUID(),
      );
      if (reopened === "missing") return { error: "This source was not found" };
      if (reopened === "ready") return { error: "A ready source cannot be retried" };
      if (reopened === "unavailable") {
        return { error: "This source cannot be retried" };
      }

      if (!startPreparation) return { source: reopened.source };

      const nextRunId = await startPreparation(reopened.source.id);
      const stored = await setSourceRunId(reopened.source.id, nextRunId);
      return { source: stored ?? reopened.source };
    },

    async removeAbandonedUpload(upload: AbandonedUpload) {
      if (now() < upload.expiresAt) return;
      const sourceId = await getSourceIdByObjectKey(upload.objectKey, {
        includeDeleted: true,
      });
      if (sourceId) return;
      await storage.deleteObject(upload.objectKey);
    },

    async deleteSource(caller: SourceCaller, sourceId: string) {
      if (!caller) return { error: "Not authenticated" };

      const removed = await deleteOwnedSource(caller.id, sourceId);
      if (!removed) return { error: "This source was not found" };
      return { deleted: true as const };
    },

    async deleteSourcesForStudent(userId: string) {
      const owned = await deleteSourcesForUser(userId);
      for (const source of owned) {
        await storage.deleteObject(source.objectKey);
      }
    },

    async finishRun(sourceId: string) {
      const source = await getSourceForPreparation(sourceId);
      if (!source?.runId || !runs) return;
      if (!source.deletedAt && source.status === "preparing") return;
      await notify(runs, source.runId, { type: "finished" });
    },

    async replay(caller: SourceCaller, runId: string) {
      const owned = await ownedRun(caller, runId);
      if ("error" in owned) return owned;
      if (!runs) return { events: [] };
      return { events: await runs.history(owned.source.runId) };
    },

    async subscribe(caller: SourceCaller, runId: string) {
      const owned = await ownedRun(caller, runId);
      if ("error" in owned) return owned;
      return { channel: owned.source.runId };
    },
  };
}

async function ownedRun(caller: SourceCaller, runId: string) {
  if (!caller) return { error: "Not authenticated" as const };
  const source = await getOwnedSourceByRun(caller.id, runId);
  if (!source?.runId) return { error: "This source was not found" as const };
  return { source: { ...source, runId: source.runId } };
}

async function discardTemporaryPdf(path: string) {
  try {
    await rm(path, { force: true });
  } catch {
    return;
  }
}

async function notify(
  runs: RunChannel | undefined,
  runId: string | null,
  event: PreparationEvent,
) {
  if (!runs || !runId) return;
  try {
    await runs.emit(runId, event);
  } catch {
    return;
  }
}

function requiredSecret() {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error("BETTER_AUTH_SECRET is not set");
  return value;
}

function signUpload(pending: PendingUpload, secret: string) {
  const body = Buffer.from(JSON.stringify(pending)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function readUpload(
  confirmation: string,
  secret: string,
): PendingUpload | "invalid" {
  const [body, signature, extra] = confirmation.split(".");
  if (!body || !signature || extra) return "invalid";

  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const given = Buffer.from(signature);
  const actual = Buffer.from(expected);
  if (given.length !== actual.length || !timingSafeEqual(given, actual)) {
    return "invalid";
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return "invalid";
  }
  if (!isPendingUpload(parsed)) return "invalid";
  if (parsed.userId.length === 0) return "invalid";
  return parsed;
}

function isPendingUpload(value: unknown): value is PendingUpload {
  if (typeof value !== "object" || value === null) return false;
  const pending = value as Partial<PendingUpload>;
  return (
    typeof pending.sourceId === "string" &&
    typeof pending.userId === "string" &&
    typeof pending.filename === "string" &&
    typeof pending.objectKey === "string" &&
    typeof pending.byteLength === "number" &&
    typeof pending.exp === "number"
  );
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "23505") return true;
  if ("cause" in error) return isUniqueViolation(error.cause);
  return false;
}
