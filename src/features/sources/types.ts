import type { z } from "zod";
import type { sources } from "./schema";
import type { SourceExtension } from "./utils";
import type {
  confirmSourceUploadSchema,
  requestSourceUploadSchema,
  retrySourceSchema,
} from "./validations";

export type SourceRecord = Pick<
  typeof sources.$inferSelect,
  "id" | "filename" | "status" | "failureReason" | "runId" | "userId"
>;

export type UploadGrant = {
  sourceId: string;
  uploadUrl: string;
  expiresInSeconds: number;
  contentLength: number;
  confirmation: string;
};

export type RequestSourceUploadInput = z.infer<typeof requestSourceUploadSchema>;
export type ConfirmSourceUploadInput = z.infer<typeof confirmSourceUploadSchema>;
export type RetrySourceInput = z.infer<typeof retrySourceSchema>;

export type SourceCaller = { id: string } | null;

export type PdfPageText = {
  page: number;
  text: string;
};

export type OfficeExtension = Exclude<SourceExtension, "pdf">;

export type ConvertedOfficePdf = {
  pdf: Uint8Array;
  path: string;
};

export type PassageRecord = {
  page: number;
  order: number;
  text: string;
  embedding: number[];
};

export type PreparationEvent =
  | { type: "step"; name: "extracting text" | "splitting passages" | "embedding" }
  | { type: "finished" };

export type RunChannel = {
  emit(runId: string, event: PreparationEvent): Promise<void>;
  history(runId: string): Promise<PreparationEvent[]>;
};

export type AbandonedUpload = {
  objectKey: string;
  expiresAt: number;
};

export type SourceStorage = {
  createUploadUrl(input: {
    key: string;
    contentLength: number;
    expiresInSeconds: number;
  }): Promise<{ url: string; expiresInSeconds: number }>;
  statObject(key: string): Promise<{ contentLength: number } | null>;
  readObject(key: string): Promise<Uint8Array | null>;
  deleteObject(key: string): Promise<void>;
};
