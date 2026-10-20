"use server";

import { updateTag } from "next/cache";
import { validatedActionWithUser } from "@/lib/action-middlewares";
import { startSourcePreparation } from "./preparation";
import { r2Storage, StorageNotConfiguredError } from "./r2-storage";
import { createSources } from "./sources";
import {
  confirmSourceUploadSchema,
  requestSourceUploadSchema,
} from "./validations";

function openSources() {
  return createSources({
    storage: r2Storage(),
    startPreparation: startSourcePreparation,
  });
}

export const requestSourceUpload = validatedActionWithUser(
  requestSourceUploadSchema,
  async (state, session) =>
    withStorage(state, async (sources) => {
      const result = await sources.requestUpload({ id: session.user.id }, state);
      if ("error" in result) return { error: result.error, state };
      return { state: { ...state, ...result } };
    }),
);

export const confirmSourceUpload = validatedActionWithUser(
  confirmSourceUploadSchema,
  async (state, session) =>
    withStorage(state, async (sources) => {
      const result = await sources.confirmUpload({ id: session.user.id }, state);
      if ("error" in result) return { error: result.error, state };

      updateTag("sources");
      return { success: "Processing your file…", state };
    }),
);

async function withStorage<State>(
  state: State,
  run: (
    sources: ReturnType<typeof openSources>,
  ) => Promise<{ error: string; state: State } | { state: State; success?: string }>,
) {
  try {
    return await run(openSources());
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      return { error: error.message, state };
    }
    throw error;
  }
}
