import { openai } from "@ai-sdk/openai";
import { embedMany } from "ai";

const model = openai.embedding("text-embedding-3-small");

export async function embedPassageTexts(texts: string[]) {
  if (texts.length === 0) return [];

  const { embeddings } = await embedMany({
    model,
    values: texts,
  });

  return embeddings;
}
