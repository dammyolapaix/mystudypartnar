import { Redis } from "@upstash/redis";
import { Client } from "@upstash/workflow";

export { handle, Realtime } from "@upstash/realtime";
export { serve } from "@upstash/workflow/nextjs";

let workflow: Client | null | undefined;
let redis: Redis | undefined;
let redisResolved = false;

function workflowClient() {
  if (workflow !== undefined) return workflow;
  const token = process.env.QSTASH_TOKEN;
  workflow = token ? new Client({ token }) : null;
  return workflow;
}

export function upstashRedis() {
  if (redisResolved) return redis;
  redisResolved = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) redis = new Redis({ url, token });
  return redis;
}

export async function triggerWorkflow(path: string, body: unknown) {
  const baseUrl = process.env.BETTER_AUTH_URL;
  const client = workflowClient();
  if (!client || !baseUrl) return null;

  const { workflowRunId } = await client.trigger({
    url: new URL(path, baseUrl).href,
    body,
  });
  return workflowRunId;
}
