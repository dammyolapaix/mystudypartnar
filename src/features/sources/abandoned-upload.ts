import { Client } from "@upstash/workflow";
import { r2Storage } from "./r2-storage";
import { createSources } from "./sources";
import type { AbandonedUpload } from "./types";

export async function scheduleAbandonedUpload(upload: AbandonedUpload) {
  const token = process.env.QSTASH_TOKEN;
  const baseUrl = process.env.BETTER_AUTH_URL;
  if (!token || !baseUrl) return;

  const client = new Client({ token });
  await client.trigger({
    url: new URL("/api/sources/cleanup", baseUrl).href,
    body: upload,
  });
}

export async function removeStoredAbandonedUpload(upload: AbandonedUpload) {
  await createSources({ storage: r2Storage() }).removeAbandonedUpload(upload);
}
