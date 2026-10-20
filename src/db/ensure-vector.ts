import "dotenv/config";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

async function main() {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query("CREATE EXTENSION IF NOT EXISTS vector");
  await client.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
