import { revalidateTag } from "next/cache";
import { serve } from "@upstash/workflow/nextjs";
import {
  prepareStoredSource,
  recordStoredEmbeddingFailure,
} from "@/features/sources/prepare-source";

export const { POST } = serve<{ sourceId: string }>(
  async (context) => {
    const { sourceId } = context.requestPayload;

    await context.run("prepare-source", async () => {
      await prepareStoredSource(sourceId);
    });

    await context.run("refresh-sources", async () => {
      try {
        revalidateTag("sources", "max");
      } catch {
        return;
      }
    });
  },
  {
    failureFunction: async ({ context }) => {
      await recordStoredEmbeddingFailure(
        context.requestPayload.sourceId,
        context.workflowRunId,
      );
      revalidateTag("sources", "max");
    },
  },
);
