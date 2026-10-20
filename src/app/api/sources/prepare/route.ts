import { revalidateTag } from "next/cache";
import { serve } from "@upstash/workflow/nextjs";
import { prepareStoredSource } from "@/features/sources/prepare-source";

export const { POST } = serve<{ sourceId: string }>(async (context) => {
  const { sourceId } = context.requestPayload;

  await context.run("prepare-source", async () => {
    await prepareStoredSource(sourceId);
  });

  await context.run("refresh-sources", async () => {
    revalidateTag("sources", "max");
  });
});
