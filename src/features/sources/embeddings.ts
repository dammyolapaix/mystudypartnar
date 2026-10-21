import { embedMany } from "ai";

const model = "openai/text-embedding-3-small";

export async function embedPassageTexts(texts: string[]) {
  if (texts.length === 0) return [];

  const { embeddings } = await embedMany({
    model,
    values: texts,
  });

  return embeddings;
}
