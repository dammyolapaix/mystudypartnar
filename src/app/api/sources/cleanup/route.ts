import { serve } from "@upstash/workflow/nextjs";
import { removeStoredAbandonedUpload } from "@/features/sources/abandoned-upload";
import type { AbandonedUpload } from "@/features/sources/types";

export const { POST } = serve<AbandonedUpload>(async (context) => {
  const upload = context.requestPayload;

  await context.sleepUntil("until-upload-url-expires", new Date(upload.expiresAt));

  await context.run("remove-abandoned-upload", async () => {
    await removeStoredAbandonedUpload(upload);
  });
});
