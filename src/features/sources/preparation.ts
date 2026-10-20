import { Client } from "@upstash/workflow";

export async function startSourcePreparation(sourceId: string) {
  const token = process.env.QSTASH_TOKEN;
  const baseUrl = process.env.BETTER_AUTH_URL;
  if (!token || !baseUrl) return null;

  const client = new Client({ token });
  const { workflowRunId } = await client.trigger({
    url: new URL("/api/sources/prepare", baseUrl).href,
    body: { sourceId },
  });

  return workflowRunId;
}
