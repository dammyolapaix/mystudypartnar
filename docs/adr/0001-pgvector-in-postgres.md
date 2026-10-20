# Passages and embeddings live in Postgres with pgvector

A Source and its passages stay in the same Postgres database as the rest of the app. Passage embeddings are 1536-dimension vectors from OpenAI `text-embedding-3-small`, stored with pgvector. A separate vector database would put the passage text and its embedding in two places, so deleting a Source would have to succeed in both.
