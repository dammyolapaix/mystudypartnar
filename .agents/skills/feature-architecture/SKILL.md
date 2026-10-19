---
name: feature-architecture
description: >
  Feature-folder layout for this app. Pages in src/app are route shells.
  Domain UI, validation, and server actions live in src/features. Forms
  use React Hook Form and Sonner. Tests live in the feature's test.ts.
  Use this skill whenever the user adds or changes a page, a feature, a
  component, a form, or a server action — including "add a listing",
  "add a detail page", "build this screen", or "save this" — even if
  they never say "feature" or "architecture". Database access is the
  drizzle skill. Query strings, canonicals, and robots are the nuqs skill.
---

# Feature architecture

A file in `src/app` is a route. The domain lives in `src/features/<name>/`. The folder name is a plural kebab-case noun (`scholarships`, `saved-items`).

Three other skills own details that used to be copied into this one. Read the matching skill before writing that kind of code:

| Work | Skill |
| --- | --- |
| Tables, queries, `"use cache"`, `cacheTag`, `cacheLife`, soft delete, `pnpm db:push` | drizzle |
| Query keys, loaders, canonical URLs, robots, redirects, the sitemap | nuqs |
| shadcn primitives, `Field`, styling | shadcn |
| The red-green loop and what a seam is | tdd |

`cacheComponents` is on. `NuqsAdapter` is already mounted in the root layout. Leave it there.

## Where a file goes

Add a file when the feature has that job. An empty file is not a feature.

| File | Job |
| --- | --- |
| `schema.ts` | The table. The drizzle skill owns the shape. Feature tables spread `timestamps` from `@/db/helper` (string mode). Auth tables in `src/features/auth/schema.ts` stay on `Date`. Leave them as Better Auth generated them. |
| `queries.ts` | Every read and write. The drizzle skill owns this file. |
| `validations.ts` | Zod schemas for input this feature accepts. |
| `actions.ts` | `"use server"` mutations. Calls a query function, then `updateTag`. |
| `types.ts` | Types that belong to this feature. |
| `utils.ts` | Pure functions. Same inputs, same outputs. No database, no `fetch`, no env. |
| `components/` | UI for this feature. Kebab-case filenames. |
| `test.ts` | Vitest for this feature. One file, not a test beside every module. |

`search-params.ts` sits next to the route (`src/app/<route>/search-params.ts`). The nuqs skill owns it. It does not live in the feature folder.

Shared primitives stay in `src/components/ui/`. A composite used by more than one feature (header, footer) stays in `src/components/`. `src/app/` holds `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, and route handlers.

`cn` comes from `@/lib/utils`.

## Pages

The page renders the shell that is true for every visitor: the heading, the nav, and `metadata` or `generateMetadata`. It passes `searchParams` and `params` through as promises. The feature component that needs them sits inside `<Suspense>`. That component awaits the promise, and when the URL carries a query it loads the nuqs parsers, then calls a function from `queries.ts`.

The fallback is a sibling `*-skeleton.tsx`. Match the loaded component's outer markup (the same list or grid, the same gaps and padding) and use the shadcn `Skeleton` where text and controls will appear. The skeleton is a Server Component unless the real component has to be a client component.

```tsx
import { Suspense } from "react";
import { ScholarshipList } from "@/features/scholarships/components/scholarship-list";
import { ScholarshipListSkeleton } from "@/features/scholarships/components/scholarship-list-skeleton";

export default function ScholarshipsPage({
  searchParams,
}: PageProps<"/scholarships">) {
  return (
    <main>
      <h1>Scholarships</h1>
      <Suspense fallback={<ScholarshipListSkeleton />}>
        <ScholarshipList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
```

A filter people search for by name (a country, a degree) is a path, `/scholarships/germany`, not another query key. Which query keys are indexed, and what the canonical URL is, is the nuqs skill.

One `<h1>` per page, in the HTML the server sends. Use `main`, and `article`, `nav`, or `section` where they match the content. The title and description name the indexable fact (the country, the degree, the scholarship). On a query-driven page, build that title in `generateMetadata` the way the nuqs skill describes.

`"use client"` is for event handlers, browser APIs, and client hooks. The component that fetches stays a Server Component and passes serializable props into the client child. A page is not a client component.

A route handler is for a webhook, an OAuth callback, or a client that does not want HTML. Data for a page comes from `queries.ts`.

## Mutations

`validatedActionWithUser` in `@/lib/action-middlewares` is the wrapper for a mutation. It loads the session, parses the Zod schema from `validations.ts`, and calls the handler with `(state, session)`. A signed-out caller gets `{ error: "Not authenticated" }` before validation. A failed parse returns `{ state, errors }` keyed by field. The handler returns `{ success, state }` or `{ error, state }`.

That file has no public wrapper. A mutation that must run signed out is a change to `action-middlewares.ts`, not a `safeParse` written inside the action. The handler does not call `getSession()` again.

The action calls the query function, and after that call resolves it calls `updateTag` with the feature tag from the drizzle skill. The query function does not import `next/cache`. The tag is the feature whose rows changed. A note stored on its own table expires `saved-items`, not the public `scholarships` catalogue.

This is the `../actions` module the form below imports. It does not import `db`.

```ts
"use server";

import { updateTag } from "next/cache";
import { validatedActionWithUser } from "@/lib/action-middlewares";
import { saveScholarshipNote } from "./queries";
import { saveScholarshipSchema } from "./validations";

export const saveScholarship = validatedActionWithUser(
  saveScholarshipSchema,
  async (state, session) => {
    const saved = await saveScholarshipNote({
      userId: session.user.id,
      scholarshipId: state.scholarshipId,
      note: state.note,
    });

    if (!saved) {
      return { error: "Scholarship not found", state };
    }

    updateTag("saved-items");

    return { success: "Scholarship saved", state };
  },
);
```

## Forms

A form is a Client Component. React Hook Form is the form state. The shadcn skill's forms rules are the markup (`Field`, `FieldLabel`, `FieldError`).

The client resolver and the server wrapper share the schema in `validations.ts`. Submit runs inside `useTransition`, and the button stays disabled while `isPending` is true. Field errors from the action go back onto the form with `form.setError`. A top-level `error`, including `"Not authenticated"`, is `toast.error`. On success, reset the form, then `toast.success` with the action's message.

`Toaster` from `@/components/ui/sonner` is mounted once in `src/app/layout.tsx`.

`react-hook-form`, `@hookform/resolvers`, and `sonner` are dependencies. If a control is missing, add it with `pnpm dlx shadcn@latest add` rather than writing a new primitive.

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { saveScholarship } from "../actions";
import type { SaveScholarshipState } from "../types";
import { saveScholarshipSchema } from "../validations";

export function SaveScholarshipForm({
  scholarshipId,
}: {
  scholarshipId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<SaveScholarshipState>({
    resolver: zodResolver(saveScholarshipSchema),
    defaultValues: { scholarshipId, note: "" },
  });

  function onSubmit(data: SaveScholarshipState) {
    startTransition(async () => {
      const result = await saveScholarship(data);

      if (result.errors) {
        for (const [field, messages] of Object.entries(result.errors)) {
          if (messages?.[0]) {
            form.setError(field as keyof SaveScholarshipState, {
              message: messages[0],
            });
          }
        }
        return;
      }

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.success) {
        form.reset(result.state ?? data);
        toast.success(result.success);
      }
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>
        <Controller
          name="note"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="save-note">Note</FieldLabel>
              <Input {...field} id="save-note" aria-invalid={fieldState.invalid} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
```

## Tests

`vitest.config.ts` already includes `src/features/**/test.ts`. Test the public seam that changed: `actions.ts`, `queries.ts`, or `utils.ts`. A test does not import `db`. The tdd skill is how to write the test. Run `pnpm test`.

## Types

Use `type`, not `interface`. When Zod or Drizzle already has the shape, derive it (`z.infer<typeof schema>`, `typeof scholarships.$inferSelect`) instead of writing a second one. Feature types stay in that feature's `types.ts`. Types shared across features stay in `src/types` (`Session` is there).

## Checklist

- The page is a shell. The await and the query sit in a Suspense child with a matching `*-skeleton.tsx`.
- Table, query, and cache rules came from the drizzle skill. Query-string rules came from the nuqs skill.
- A mutation goes through `validatedActionWithUser`, then `updateTag` with the feature tag.
- A form uses React Hook Form, the shared Zod schema, `useTransition`, and Sonner.
- `test.ts` covers the seam that changed, and it does not import `db`.
- No component file was added under `src/app/`.
- The feature folder is a plural kebab-case noun.
