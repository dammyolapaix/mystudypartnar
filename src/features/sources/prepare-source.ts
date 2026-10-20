import { embedPassageTexts } from "./embeddings";
import { extractPdfPages } from "./pdf-text";
import { r2Storage } from "./r2-storage";
import { createSources } from "./sources";

export async function prepareStoredSource(sourceId: string) {
  await openSources().prepare(sourceId);
}

export async function recordStoredEmbeddingFailure(sourceId: string, runId?: string) {
  await openSources().recordEmbeddingFailure(sourceId, runId);
}

function openSources() {
  return createSources({
    storage: r2Storage(),
    extractPdf: extractPdfPages,
    embedPassages: embedPassageTexts,
  });
}
