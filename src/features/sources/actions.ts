"use server";

import { updateTag } from "next/cache";
import { validatedActionWithUser } from "@/lib/action-middlewares";
import { r2Storage, StorageNotConfiguredError } from "@/lib/r2";
import { scheduleAbandonedUpload } from "./abandoned-upload";
import { startSourcePreparation } from "./preparation";
import { createSources } from "./sources";
import {
  confirmSourceUploadSchema,
  deleteSourceSchema,
  refreshSourcesSchema,
  requestSourceUploadSchema,
  retrySourceSchema,
} from "./validations";

function openSources() {
  return createSources({
    storage: r2Storage(),
    startPreparation: startSourcePreparation,
    scheduleAbandonedUpload,
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

export const retrySource = validatedActionWithUser(
  retrySourceSchema,
  async (state, session) => {
    const sources = createSources({
      storage: {
        async createUploadUrl() {
          throw new StorageNotConfiguredError();
        },
        async statObject() {
          return null;
        },
        async readObject() {
          return null;
        },
        async deleteObject() {},
      },
      startPreparation: startSourcePreparation,
    });
    const result = await sources.retry({ id: session.user.id }, state.sourceId);
    if ("error" in result) return { error: result.error, state };

    updateTag("sources");
    return { success: "Processing your file…", state };
  },
);

export const deleteSource = validatedActionWithUser(
  deleteSourceSchema,
  async (state, session) =>
    withStorage(state, async (sources) => {
      const result = await sources.deleteSource({ id: session.user.id }, state.sourceId);
      if ("error" in result) return { error: result.error, state };

      updateTag("sources");
      return { success: "Source deleted", state };
    }),
);

export const refreshSources = validatedActionWithUser(
  refreshSourcesSchema,
  async (state) => {
    updateTag("sources");
    return { state };
  },
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
