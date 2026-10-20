# Original Source files live in Cloudflare R2

The uploaded bytes for a Source are stored in Cloudflare R2. Postgres stores the Source record and its passages, not the file body. The original is deleted from R2 when the Source is deleted.
