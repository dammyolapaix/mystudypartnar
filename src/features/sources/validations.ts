import { z } from "zod";
import { MAX_SOURCE_BYTES, sourceExtension } from "./utils";

export const requestSourceUploadSchema = z.object({
  filename: z
    .string()
    .min(1, { error: "Choose a file" })
    .refine((filename) => sourceExtension(filename) !== null, {
      error: "This file type is not allowed",
    }),
  byteLength: z
    .number()
    .int()
    .refine((byteLength) => byteLength > 0, { error: "File is empty" })
    .refine((byteLength) => byteLength <= MAX_SOURCE_BYTES, {
      error: "File is over 50 MB",
    }),
  sourceId: z.string().optional(),
  uploadUrl: z.string().optional(),
  expiresInSeconds: z.number().optional(),
  contentLength: z.number().optional(),
  confirmation: z.string().optional(),
});

export const confirmSourceUploadSchema = z.object({
  confirmation: z.string().min(1),
});

export const retrySourceSchema = z.object({
  sourceId: z.uuid(),
});

export const refreshSourcesSchema = z.object({});
