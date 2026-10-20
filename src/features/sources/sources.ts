import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { insertSource } from "./queries";
import type { SourceCaller, SourceRecord, SourceStorage, UploadGrant } from "./types";
import {
  MAX_SOURCE_BYTES,
  sourceBytesMatch,
  sourceExtension,
  sourceObjectKey,
  UPLOAD_URL_SECONDS,
} from "./utils";

export type { SourceStorage } from "./types";
export { listSources } from "./queries";

type SourcesDependencies = {
  storage: SourceStorage;
  now?: () => number;
  secret?: string;
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
        return { source };
      } catch (error) {
        if (isUniqueViolation(error)) {
          return { error: "This upload was already saved" };
        }
        throw error;
      }
    },
  };
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
