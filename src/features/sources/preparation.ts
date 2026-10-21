import { triggerWorkflow } from "@/lib/upstash";

export async function startSourcePreparation(sourceId: string) {
  return triggerWorkflow("/api/sources/prepare", { sourceId });
}
