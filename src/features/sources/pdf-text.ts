import { extractTextWithPositionsAsync } from "@firecrawl/pdf-inspector";
import type { PdfPageText } from "./types";

export async function extractPdfPages(bytes: Uint8Array): Promise<PdfPageText[]> {
  const items = await extractTextWithPositionsAsync(Buffer.from(bytes));
  const byPage = new Map<number, string[]>();

  for (const item of items) {
    if (String(item.itemType) !== "Text" || item.text.length === 0) continue;
    const lines = byPage.get(item.page) ?? [];
    lines.push(item.text);
    byPage.set(item.page, lines);
  }

  return [...byPage.entries()]
    .sort(([left], [right]) => left - right)
    .map(([page, lines]) => ({
      page,
      text: lines.join("\n"),
    }));
}
