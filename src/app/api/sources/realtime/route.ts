import { handle } from "@upstash/realtime";
import { getSourceRealtime } from "@/features/sources/run-channel";
import { createSources } from "@/features/sources/sources";
import type { SourceStorage } from "@/features/sources/types";
import { getSession } from "@/lib/session";

const unusedStorage: SourceStorage = {
  async createUploadUrl() {
    throw new Error("File storage is not configured");
  },
  async statObject() {
    return null;
  },
  async readObject() {
    return null;
  },
};

export function GET(request: Request) {
  return handle({
    realtime: getSourceRealtime(),
    middleware: async ({ channels }) => {
      const session = await getSession();
      if (!session) return new Response("Not authenticated", { status: 401 });

      const sources = createSources({ storage: unusedStorage });
      for (const channel of channels) {
        const result = await sources.subscribe({ id: session.user.id }, channel);
        if ("error" in result) {
          return new Response(result.error, { status: 403 });
        }
      }
    },
  })(request);
}
