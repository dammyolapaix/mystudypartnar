import type { z } from "zod";
import type { sources } from "./schema";
import type {
  confirmSourceUploadSchema,
  requestSourceUploadSchema,
} from "./validations";

export type SourceRecord = Pick<
  typeof sources.$inferSelect,
  "id" | "filename" | "status" | "studentId"
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

export type SourceCaller = { id: string } | null;

export type SourceStorage = {
  createUploadUrl(input: {
    key: string;
    contentLength: number;
    expiresInSeconds: number;
  }): Promise<{ url: string; expiresInSeconds: number }>;
  statObject(key: string): Promise<{ contentLength: number } | null>;
  readObject(key: string): Promise<Uint8Array | null>;
};
