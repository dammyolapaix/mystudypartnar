# Public listing pattern

Worked example for a listing whose content depends on the query string. The decision rules live in `SKILL.md`. Match this shape; don't invent a second parser map.

`metadataBase` belongs on the root layout once:

```tsx
export const metadata: Metadata = {
  metadataBase: new URL('https://portalforscholarships.com'),
}
```

## search-params.ts

```ts
import {
  createLoader,
  createSearchParamsCache,
  createSerializer,
  parseAsIndex,
  parseAsString,
  parseAsStringLiteral,
  type inferParserType,
} from 'nuqs/server'

export const countries = ['germany', 'canada'] as const
export const degrees = ['bachelor', 'master', 'phd'] as const

export const scholarshipParsers = {
  q: parseAsString.withDefault(''),
  country: parseAsStringLiteral(countries),
  degree: parseAsStringLiteral(degrees),
  page: parseAsIndex.withDefault(0).withOptions({
    history: 'push',
    shallow: false,
  }),
  // Server applies sort, so the client hook uses shallow: false.
  // The canonical helper below still drops it.
  sort: parseAsStringLiteral(['deadline', 'amount'] as const).withDefault(
    'deadline',
  ),
}

export const loadScholarshipParams = createLoader(scholarshipParsers)
export const scholarshipParamsCache =
  createSearchParamsCache(scholarshipParsers)
export const serializeScholarshipParams = createSerializer(scholarshipParsers)

export type ScholarshipParams = inferParserType<typeof scholarshipParsers>

export function canonicalScholarshipHref(
  pathname: string,
  state: ScholarshipParams,
) {
  // Serializer args are nullable. Null drops the key even when the
  // address bar still has a non-default sort.
  return serializeScholarshipParams(pathname, { ...state, sort: null })
}

export function shouldIndexScholarships(state: ScholarshipParams) {
  if (state.q) return false
  const facets = [state.country, state.degree].filter(Boolean).length
  return facets <= 1
}
```

`canonicalScholarshipHref` nulls same-document keys so `clearOnDefault` drops them. Identity, facets, `q`, and `page` stay.

## Dirty-URL redirect

Owned keys only. Sort both sides so `?degree=master&country=germany` and `?country=germany&degree=master` are not a redirect. Unowned keys (`utm_source`) are copied onto the target and ignored in the comparison. If the module passes `urlKeys`, the owned set is the public names (`country`), not the code names (`countryOfStudy`).

```ts
import { permanentRedirect } from 'next/navigation'
import type { SearchParams } from 'nuqs/server'
import {
  scholarshipParsers,
  serializeScholarshipParams,
  type ScholarshipParams,
} from './search-params'

const ownedKeys = new Set(Object.keys(scholarshipParsers))

function ownedQuery(raw: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(raw)) {
    if (!ownedKeys.has(key) || value == null) continue
    for (const item of Array.isArray(value) ? value : [value]) {
      params.append(key, item)
    }
  }
  params.sort()
  return params.toString()
}

function unownedQuery(raw: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(raw)) {
    if (ownedKeys.has(key) || value == null) continue
    for (const item of Array.isArray(value) ? value : [value]) {
      params.append(key, item)
    }
  }
  return params.toString()
}

export function redirectIfDirty(
  pathname: string,
  raw: Awaited<SearchParams>,
  state: ScholarshipParams,
) {
  const clean = serializeScholarshipParams(pathname, state)
  const cleanQuery = new URL(clean, 'http://localhost').searchParams
  cleanQuery.sort()
  if (cleanQuery.toString() === ownedQuery(raw)) return

  const extra = unownedQuery(raw)
  permanentRedirect(
    serializeScholarshipParams(extra ? `${pathname}?${extra}` : pathname, state),
  )
}
```

`?country=banana` parses as `null`, the serializer omits it, the raw owned query still contains `country`, so this redirects to the clean listing. `?page=1` (the `parseAsIndex` default) does the same. `?utm_source=newsletter` does not.

## page.tsx

With `cacheComponents` enabled, the page does not await the promise. The results component does, then fills the cache for nested server components.

```tsx
import type { Metadata } from 'next'
import { Suspense } from 'react'
import {
  canonicalScholarshipHref,
  loadScholarshipParams,
  scholarshipParamsCache,
  shouldIndexScholarships,
} from './search-params'
import { redirectIfDirty } from './redirect-if-dirty'
import { ScholarshipFilters } from './filters'

const pathname = '/scholarships'

export async function generateMetadata({
  searchParams,
}: PageProps<'/scholarships'>): Promise<Metadata> {
  const state = await loadScholarshipParams(searchParams)
  const canonical = canonicalScholarshipHref(pathname, state)
  const place = state.country
    ? ` in ${state.country}`
    : state.degree
      ? ` for ${state.degree} students`
      : ''

  return {
    title: state.q
      ? `Scholarships matching “${state.q}”`
      : `Scholarships${place}`,
    description: `Browse scholarships${place}.`,
    alternates: { canonical },
    openGraph: { url: canonical },
    robots: shouldIndexScholarships(state)
      ? { index: true, follow: true }
      : { index: false, follow: true },
  }
}

export default function Page({ searchParams }: PageProps<'/scholarships'>) {
  return (
    <Suspense fallback={<p>Loading scholarships…</p>}>
      <ScholarshipResults searchParams={searchParams} />
    </Suspense>
  )
}

async function ScholarshipResults({
  searchParams,
}: Pick<PageProps<'/scholarships'>, 'searchParams'>) {
  const raw = await searchParams
  const state = await loadScholarshipParams(raw)
  redirectIfDirty(pathname, raw, state)
  await scholarshipParamsCache.parse(raw)

  const scholarships = await getScholarships(state)

  return (
    <>
      <ScholarshipFilters />
      <ul>
        {scholarships.map((scholarship) => (
          <li key={scholarship.id}>{scholarship.name}</li>
        ))}
      </ul>
    </>
  )
}

async function getScholarships(state: Awaited<ReturnType<typeof loadScholarshipParams>>) {
  'use cache'
  // query by state.country, state.degree, state.q, state.page, state.sort
  return [] as { id: string; name: string }[]
}
```

`getScholarships` receives the parsed state. Reading `searchParams` inside the cached function would drop the query from the cache key.

Without `cacheComponents`, the same loader and metadata apply; the Suspense split is optional and awaiting in the page is allowed.

## Filters and landing links

```tsx
import Link from 'next/link'
import { countries, serializeScholarshipParams } from './search-params'

export function CountryLinks({ pathname }: { pathname: string }) {
  return (
    <ul>
      {countries.map((country) => (
        <li key={country}>
          <Link
            href={serializeScholarshipParams(pathname, { country, page: null })}
            prefetch={true}
          >
            {country}
          </Link>
        </li>
      ))}
    </ul>
  )
}
```

`prefetch={true}` is for `partialPrefetching`. Omit it when that flag is off. Don't prefetch every combination — only the landing facets you are willing to spend a server render on.

## UI-only key on a public document

Don't add it to the server loader. A static canonical is enough, because the HTML does not depend on the key:

```tsx
export const metadata: Metadata = {
  alternates: { canonical: '/scholarships/daad-scholarship' },
}
```

```tsx
'use client'
import { parseAsStringLiteral, useQueryState } from 'nuqs'

export function SectionTabs() {
  const [tab, setTab] = useQueryState(
    'tab',
    parseAsStringLiteral(['overview', 'eligibility'] as const).withDefault(
      'overview',
    ),
  )
  // highlight only. Eligibility copy is already in the server HTML.
}
```

If that copy is **not** in the server HTML, the tab is the wrong tool. Render the copy, or move it to a path.
