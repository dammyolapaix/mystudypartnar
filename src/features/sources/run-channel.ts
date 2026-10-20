import { Redis } from "@upstash/redis";
import { Realtime } from "@upstash/realtime";
import { z } from "zod";
import type { PreparationEvent, RunChannel } from "./types";

const schema = {
  source: {
    step: z.object({
      name: z.enum(["extracting text", "splitting passages", "embedding"]),
    }),
    finished: z.object({}),
  },
};

const HISTORY_LIMIT = 50;
const HISTORY_SECONDS = 60 * 60;

export function getSourceRealtime() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  return new Realtime({
    schema,
    redis: url && token ? new Redis({ url, token }) : undefined,
    history: { maxLength: HISTORY_LIMIT, expireAfterSecs: HISTORY_SECONDS },
  });
}

export function sourceRunChannel(): RunChannel {
  const realtime = getSourceRealtime();

  return {
    async emit(runId, event) {
      const channel = realtime.channel(runId);
      if (event.type === "finished") {
        await channel.emit("source.finished", {});
        return;
      }
      await channel.emit("source.step", { name: event.name });
    },
    async history(runId) {
      if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
        return [];
      }

      const messages = await realtime.channel(runId).history({ limit: HISTORY_LIMIT });
      return messages.flatMap((message) => {
        const event = preparationEvent(message.event, message.data);
        return event ? [event] : [];
      });
    },
  };
}

function preparationEvent(event: string, data: unknown): PreparationEvent | null {
  if (event === "source.finished") return { type: "finished" };
  if (event !== "source.step" || !isStep(data)) return null;
  return { type: "step", name: data.name };
}

function isStep(
  data: unknown,
): data is { name: "extracting text" | "splitting passages" | "embedding" } {
  if (typeof data !== "object" || data === null || !("name" in data)) return false;
  return (
    data.name === "extracting text" ||
    data.name === "splitting passages" ||
    data.name === "embedding"
  );
}
