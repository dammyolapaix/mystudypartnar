import { embedPassageTexts } from "./embeddings";
import { extractPdfPages } from "./pdf-text";
import { r2Storage } from "./r2-storage";
import { createSources } from "./sources";

export async function prepareStoredSource(sourceId: string) {
  await createSources({
    storage: r2Storage(),
    extractPdf: extractPdfPages,
    embedPassages: embedPassageTexts,
  }).prepare(sourceId);
}
