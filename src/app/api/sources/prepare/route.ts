import { revalidateTag } from "next/cache";
import { serve } from "@upstash/workflow/nextjs";
import {
  finishStoredSource,
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

    await context.run("finish-run", async () => {
      await finishStoredSource(sourceId);
    });
  },
  {
    failureFunction: async ({ context }) => {
      await recordStoredEmbeddingFailure(
        context.requestPayload.sourceId,
        context.workflowRunId,
      );
      try {
        revalidateTag("sources", "max");
      } catch {
        // The finish event still asks the open page to read the row.
      }
      await finishStoredSource(context.requestPayload.sourceId);
    },
  },
);
