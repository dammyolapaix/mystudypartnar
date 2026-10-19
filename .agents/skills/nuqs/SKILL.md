---
name: nuqs
description: >
  Type-safe URL search params with nuqs on the Next.js App Router. Public
  pages must be server-rendered from the query string, with canonical URLs,
  robots, and stable params so the indexed URL and the HTML match. Use this
  skill whenever the user mentions nuqs, search params, query strings,
  filters, sorting, pagination, faceted navigation, or URL state on a page
  — including listing and detail pages — even if they never say "nuqs",
  "SEO", or "server-side".
---

# nuqs for public pages

nuqs is the source of truth for query strings. On a public page the server, the canonical URL, and the client controls all share one parser map imported from `nuqs/server`. Crawlers request a URL and read the HTML and `<head>` for that URL. Client-only state does not exist for them.

Docs, when a detail here is not enough: [server-side](https://nuqs.dev/docs/server-side.md), [SEO](https://nuqs.dev/docs/seo.md). This repo is Next.js App Router with `nuqs@^2`. `searchParams` is a Promise. Prefer `PageProps<'/route'>`.

## Classify every key before writing code

Each key is one of these. The class decides the canonical, whether Google may index the URL, and whether the client update notifies the server.

`shallow` follows whether the **server renders from that key**, not whether the key is indexed. A sort that the database applies is `shallow: false` even though it stays out of the canonical. A grid/list toggle over data the client already has is `shallow: true`.

| Class | Examples | In the canonical | Index | `shallow` |
| --- | --- | --- | --- | --- |
| Identity | a slug or id that **is** the page (`v` on a watch URL) | yes | yes, `notFound()` when missing or invalid | `false` |
| Landing facet | one meaningful filter: country, degree | yes | yes, with a title and description that name it | `false` |
| Pagination | `page` via `parseAsIndex` | yes, including page 2+ | yes | `false`, `history: 'push'` |
| Extra facet | a second or third filter stacked on a landing facet | yes (self) | no (`noindex, follow`) unless the user has an explicit allowlist | `false` |
| Free-text search | `q` | yes (self) | no (`noindex, follow`) | `false`, debounce the URL write |
| Same-document | sort, page size | no | follow the canonical without that key | `false` when the server applies it |
| UI-only | tab, modal, drawer, grid/list on data already loaded | no | the path without the key | `true` (default) |
| Attribution | `utm_*`, `ref`, `gclid` | no | ignore | leave them alone |

Why the canonical and the index decision diverge: `noindex` means "do not file this URL." It does not mean "this URL is a duplicate." A search-results URL and a two-filter URL show a **different** result set, so their canonical is themselves. Sort and view show the **same** set, so their canonical drops those keys. Never point a canonical at a page with different results. Never point page 2 at page 1.

Content that should rank has to be in the server HTML for the URL that canonicalizes to it. A `?tab=eligibility` client panel is invisible to that rule. If eligibility should rank, render it in the document (or give it a path). The query key may only highlight it.

Signed-in and app pages are not public. `noindex` the segment and skip the indexing rules. Still share parsers if the server reads the query.

A filter with its own search demand is a stronger URL as a path (`/scholarships/germany`) than as a query. Use nuqs for controls and combinations on a listing, not as a substitute for that path.

## One module per route

Colocate `search-params.ts` with the route. Import parsers, `createLoader`, `createSerializer`, and `createSearchParamsCache` from `nuqs/server` only. Importing them from `nuqs` pulls the client bundle into Server Components and breaks `.withDefault` / `.withOptions`.

```ts
// app/scholarships/search-params.ts
import {
  createLoader,
  createSearchParamsCache,
  createSerializer,
  parseAsIndex,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs/server'

export const countries = ['germany', 'canada'] as const

export const scholarshipParsers = {
  q: parseAsString.withDefault(''),
  country: parseAsStringLiteral(countries),
  page: parseAsIndex.withDefault(0).withOptions({
    history: 'push',
    shallow: false,
  }),
  sort: parseAsStringLiteral(['deadline', 'amount'] as const).withDefault(
    'deadline',
  ),
}

export const loadScholarshipParams = createLoader(scholarshipParsers)
export const scholarshipParamsCache = createSearchParamsCache(scholarshipParsers)
export const serializeScholarshipParams = createSerializer(scholarshipParsers)
```

Use `parseAsStringLiteral` or `parseAsStringEnum` for facets. `parseAsString` accepts any value, so junk URLs become real pages. Use `parseAsIndex` for pages: the URL is 1-based (`?page=2`) and the default `0` is omitted, so page 1 has no `page` key. Pass `urlKeys` to the loader, the cache, the serializer, and `useQueryStates` together when the code name and the public key differ (`countryOfStudy` → `country`). After a public URL ships, the key is part of the web. Do not rename it.

`clearOnDefault` defaults to `true`. Leave it on. Explicit defaults (`?page=1`, `?sort=deadline`) are duplicate URLs.

The full listing — metadata, redirect, Suspense, client controls — is in [references/public-listing.md](references/public-listing.md). Read it before implementing a public listing.

## Server render

Load with the loader inside the component that fetches. Pass the parsed object into a `'use cache'` function as arguments. Do not read `searchParams` inside `'use cache'`; the cache key would miss the query, and Cache Components rejects runtime data there.

Call `scholarshipParamsCache.parse` in that same server component before any child calls `.get` or `.all`. The cache is React `cache()`, one render only. `generateMetadata` does not share it with the page. Call the loader again in `generateMetadata`.

Check `next.config` for `cacheComponents`:

- **On** (this repo): do not await `searchParams` in the page body. Pass the promise into a child wrapped in `<Suspense>`, and load it there. Awaiting at the top of the page blocks the static shell (`blocking-prerender-runtime`). `generateMetadata` may read `searchParams`. That is what crawlers need in `<head>` (Next does not stream metadata to bots). If the build then reports `blocking-prerender-metadata-runtime` and the page has no other dynamic hole, add the dynamic marker from the Next.js Cache Components guide — do not stop reading the query in `generateMetadata` on a content-defining page.
- **Off**: awaiting in the page is fine. It opts the route into dynamic rendering, which is what a query-driven listing is.

`shallow: false` on every key the server renders from, including sort and page size, so a change re-renders the server tree and `generateMetadata`. The default `shallow: true` updates the address bar only. The first crawl of a shared URL is still server-rendered either way; `shallow: false` keeps the live document in sync with that URL.

## Canonical, robots, redirect

Set `metadataBase` once on the root layout. A relative `alternates.canonical` without it fails the build.

In `generateMetadata`:

1. Load the params.
2. Build the canonical with the serializer, passing `null` for same-document and UI-only keys so they are omitted. Keep identity, landing facets, extra facets, search, and pagination.
3. Set `alternates.canonical` and `openGraph.url` to that href.
4. Set `title` and `description` from the indexable facts (facet, page), not from sort or view.
5. Set `robots` to the full object. A page-level `robots` field replaces the parent's, it does not merge.

```ts
robots: shouldIndex(state)
  ? { index: true, follow: true }
  : { index: false, follow: true }
```

Default `shouldIndex`: no free-text query, and at most one landing facet. Pagination of an indexable URL stays indexable. Deviate only when the user has named the URLs that belong in the sitemap. Put those URLs in the sitemap. Do not emit the cartesian product.

Redirect a **dirty encoding** to the clean URL with `permanentRedirect` (308) from the server component that loaded the params. Dirty means the owned keys are not what the serializer emits: an invalid literal (`?country=banana` parses as null and disappears), an explicit default (`?page=1`), a non-canonical spelling. Compare owned keys only, after sorting both sides for the comparison, so key order and `utm_*` do not redirect. Preserve unowned keys on the redirect target (`serialize(\`${path}?${unowned}\`, state)`) so campaign params survive. Do not redirect merely to strip sort or `utm`.

Same-document keys stay in the address bar and out of the canonical. Stripping them with a redirect would throw away the user's sort.

## Client controls

Client components import `useQueryStates` from `nuqs` and the parsers from the shared module. They do not declare a second parser map.

```tsx
'use client'

import { debounce, useQueryStates } from 'nuqs'
import { useTransition } from 'react'
import { scholarshipParsers } from './search-params'

export function ScholarshipFilters() {
  const [isPending, startTransition] = useTransition()
  const [state, setState] = useQueryStates(scholarshipParsers, {
    shallow: false,
    startTransition,
  })

  return (
    <input
      aria-busy={isPending}
      value={state.q}
      onChange={(event) =>
        setState(
          { q: event.target.value, page: null },
          {
            limitUrlUpdates:
              event.target.value === '' ? undefined : debounce(400),
          },
        )
      }
    />
  )
}
```

`debounce` and `throttle` are exported from `nuqs` and from `nuqs/server`. Debounce the URL write on text input when `shallow` is `false`, so the server is not hit per keystroke. Reset `page` to `null` when a filter changes, or the user lands on an empty deep page.

Indexable facets should also be real `<Link href={serializeScholarshipParams(path, next)}>` anchors. Crawlers follow anchors. `prefetch={true}` on those links only when `partialPrefetching` is enabled, and only for the few landing URLs worth a server prefetch.

`history` stays `'replace'` except pagination and other navigation-like steps. Do not set `history: 'push'` or `shallow: false` on `<NuqsAdapter>`.

## Adapter

One `NuqsAdapter` from `nuqs/adapters/next/app`, in the root layout. This repo already has it. Do not mount a second one. The adapter calls `useSearchParams`; its internal Suspense covers the navigation spy, not the whole tree. If the build says that hook is outside Suspense, follow the Next.js `blocking-prerender-client-hook` fix. Do not delete the adapter to silence it.

## Private pages

Server-load the query when the server fetches with it. Leave `shallow` at the default when the list is already on the client. Skip canonical gymnastics. The layout or page should be `noindex`.

## Checklist

- Parsers, loader, serializer, and cache live in one `nuqs/server` module.
- Public content is rendered from the loader, not from `useQueryState` alone.
- Cache Components: the await is under `<Suspense>`, and cached data functions take the parsed values as arguments.
- Canonical matches the indexing class of each key. `metadataBase` is set.
- Invalid values and explicit defaults 308 to the clean URL. Attribution params are kept.
- Facet links are `<Link>`s built with the serializer.
- The sitemap lists indexable canonicals only.
