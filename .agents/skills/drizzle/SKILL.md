---
name: drizzle
description: >
  Database access with Drizzle ORM in this repo. Queries live in
  src/features/<feature>/queries.ts, reads use "use cache" and cacheTag
  inside that function, and schema changes are applied with pnpm db:push.
  Use this skill whenever the user mentions Drizzle, the database, a table,
  a column, a query, a migration, SQL, or loading or saving records — even
  if they never say "Drizzle" or ask for a query file.
---

# Drizzle in this repo

Pages, Server Actions, and route handlers do not import `db`. They call a function in `src/features/<feature>/queries.ts`. That file is the only place that queries the database, apart from the two exceptions below.

This is Drizzle `1.0.0-rc.4` on Postgres (`snakeCase.table`, `drizzle-orm/node-postgres`). The client is the default export of `@/db`. Docs when a detail here is not enough: [Drizzle](https://orm.drizzle.team/llms.txt), and for a read, [queries](https://orm.drizzle.team/docs/pg/data-querying) and [push](https://orm.drizzle.team/docs/pg/drizzle-kit-push).

## Where code goes

| What | Where |
| --- | --- |
| Table | `src/features/<feature>/schema.ts` |
| Re-export so Drizzle Kit sees it | `src/db/schema.ts` |
| Every select, insert, update, delete | `src/features/<feature>/queries.ts` |
| The client | `src/db/index.ts` only |

`drizzle.config.ts` points Kit at `src/db/schema.ts`. A table that is not re-exported from there is invisible to `pnpm db:push`.

App tables use `snakeCase.table` from `drizzle-orm/pg-core`, and spread `timestamps` from `@/db/helper`. Better Auth tables in `src/features/auth/schema.ts` are the exception. Do not reshape them to match `timestamps`.

Do not construct another `drizzle()` client in a feature. Do not import `db` from a page, a component, a Server Action, or a route handler.

Two callers hold the client itself, because a library needs it:

- `src/db/index.ts` creates it.
- `src/lib/auth.ts` passes it to Better Auth's `drizzleAdapter`.

A new library that requires the driver client is the same kind of exception. Ask before adding one. A transaction is not an exception: it stays inside the feature query function as `db.transaction(...)`.

## Reads

A function that fetches rows is async, starts with `"use cache"`, and tags the feature. The tag is the feature name, the same string every read and every write for that feature uses. Arguments are the cache key, so filters, ids, and page numbers are arguments. Do not read `cookies()`, `headers()`, or `searchParams` inside the function. Do not return a query builder. Await it.

`cacheLife` is set in the same function. This app has `cacheComponents` on, and a cached function with no `cacheLife` breaks the build when a shorter cache is nested inside it. `"hours"` is the default for public data. Use `"days"` or `"max"` only when the rows barely change.

```ts
import { cacheLife, cacheTag } from "next/cache";
import { isNull } from "drizzle-orm";
import db from "@/db";
import { scholarships } from "./schema";

export async function getScholarships() {
  "use cache";
  cacheTag("scholarships");
  cacheLife("hours");

  return db.select().from(scholarships).where(isNull(scholarships.deletedAt));
}
```

Tables that spread `timestamps` have `deletedAt`. Reads exclude those rows unless the caller asked for deleted records. Deletes on those tables set `deletedAt`. They do not call `db.delete`. Better Auth tables have no `deletedAt`. Do not invent one.

A read whose result is per user is not a shared cache. `"use cache"` would serve one user's rows to another. Pass the user id in only when the rows are still public data filtered by something the user chose. For private rows, use `"use cache: private"` and the same `cacheTag`. Prefer a public `"use cache"` read of public data.

The return value has to be serializable. Selecting plain columns does that. Do not return a Drizzle object, a class instance, or a callback.

## Writes

Write functions do not use `"use cache"`, and they do not import `next/cache`. `queries.ts` only talks to the database. Cache invalidation stays at the call site, because `updateTag` is a Server Action concern and a query function is also called from places that cannot invalidate.

```ts
import db from "@/db";
import { scholarships } from "./schema";

export async function createScholarship(values: typeof scholarships.$inferInsert) {
  const [row] = await db.insert(scholarships).values(values).returning();
  return row;
}
```

The Server Action calls `updateTag("scholarships")` after that function resolves. The tag is the same one the reads passed to `cacheTag`. `updateTag` expires it immediately, which is what a user-triggered mutation needs. Do not call it before the write, and do not call it when the write throws.

A route handler cannot call `updateTag`. After a successful write there, call `revalidateTag("scholarships", "max")` in the handler, not in `queries.ts`.

## Applying schema changes

Change the feature schema, re-export it, then apply it with:

```bash
pnpm db:push
```

That runs `drizzle-kit push`, which diffs the TypeScript schema against the database and applies the SQL itself.

Do not run `pnpm db:generate`, `pnpm db:migrate`, or `drizzle-kit generate`. Do not add, edit, or delete files under `src/db/migrations/`. This repo does not keep a migration history.

Do not pass `--force`. If push reports a data-loss statement (drop column, truncate, rewrite a type), stop and tell the user what it wants to do. Do not approve it yourself.

If `DATABASE_URL` is missing, say so. Do not invent a connection string.

## Checklist

- The page or action calls a function in `src/features/<feature>/queries.ts`.
- That file is the one that imports `db`.
- A new table is in the feature schema and re-exported from `src/db/schema.ts`.
- Reads start with `"use cache"`, `cacheTag("<feature>")`, and `cacheLife("hours")`.
- `queries.ts` does not call `updateTag` or `revalidateTag`. The Server Action does, after the write resolves.
- Soft-deleted rows stay out of reads.
- Schema changes were applied with `pnpm db:push`, and no migration file was written.
