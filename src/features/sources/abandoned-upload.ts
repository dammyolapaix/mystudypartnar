import { r2Storage } from "@/lib/r2";
import { triggerWorkflow } from "@/lib/upstash";
import { createSources } from "./sources";
import type { AbandonedUpload } from "./types";

export async function scheduleAbandonedUpload(upload: AbandonedUpload) {
  await triggerWorkflow("/api/sources/cleanup", upload);
}

export async function removeStoredAbandonedUpload(upload: AbandonedUpload) {
  await createSources({ storage: r2Storage() }).removeAbandonedUpload(upload);
}
