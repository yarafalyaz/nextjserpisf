/**
 * Pure URL-search-params helpers for <DataTable>.
 *
 * Extracted so the server-paginated search behavior can be unit-tested
 * without mounting the full client component (TanStack Table +
 * next/navigation + UI primitives).
 *
 * Background: <DataTable> drives its built-in search box through the
 * in-memory TanStack column filter. That is correct for client-paginated
 * tables (all rows are present), but when `serverPagination` is set the
 * `data` prop only holds the current page (e.g. 20 of 1000+ rows), so a
 * client-side filter silently searches just the visible page and ignores
 * every other server page. In server mode the search must instead drive a
 * URL search param so the server re-queries the whole dataset.
 */

/**
 * Apply a set of param updates to a copy of `currentParams` and return the
 * resulting query string. Empty / null / undefined values delete the param.
 */
export function buildSearchParamsString(
  currentParams: URLSearchParams,
  updates: Record<string, string | number | undefined>
): string {
  const sp = new URLSearchParams(currentParams.toString())
  for (const [k, v] of Object.entries(updates)) {
    if (v === "" || v === undefined || v === null) {
      sp.delete(k)
    } else {
      sp.set(k, String(v))
    }
  }
  return sp.toString()
}

/**
 * Compute the next URL search-string for a server-paginated search input.
 *
 * Rules:
 *  - If the term is empty/whitespace: remove the param only, keep `halaman`
 *    (no reason to bounce the user to page 1 just because they cleared the
 *    box).
 *  - If the term is non-empty: set/overwrite the param AND reset `halaman`
 *    to page 1 so the user lands on the first page of the new result set.
 *
 * The term is trimmed; internal spaces are preserved verbatim.
 */
export function buildServerSearchUrl(
  currentParams: URLSearchParams,
  searchParam: string,
  searchValue: string
): string {
  const trimmed = searchValue.trim()
  if (trimmed === "") {
    return buildSearchParamsString(currentParams, { [searchParam]: undefined })
  }
  return buildSearchParamsString(currentParams, {
    [searchParam]: trimmed,
    halaman: undefined,
  })
}
