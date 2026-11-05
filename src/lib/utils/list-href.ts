/**
 * URL builders for list pages.
 *
 * List pages carry their active view in the query string: `?cari=`,
 * `?status=`, `?tipe=`, `?klaim=1`, `?pageSize=`, plus the page number
 * `?halaman=`. Hand-built footer links like `` `/keuangan/jurnal?halaman=2` ``
 * silently dropped every other param, so paging forward reset the user's
 * search/filter and showed a different slice of data than the page count
 * implied. These helpers carry the current params forward and only override
 * what the caller names.
 *
 * Report URLs are NOT built here: reports keep everything in the path
 * (`/laporan/<laporan>/<periode>/…`, see `buildReportHref`).
 */

export type ListParams =
  | Record<string, string | string[] | undefined>
  | URLSearchParams
  | undefined

function entriesOf(current: ListParams): Array<[string, string]> {
  if (!current) return []
  if (current instanceof URLSearchParams) {
    return Array.from(current.entries())
  }
  const out: Array<[string, string]> = []
  for (const [key, raw] of Object.entries(current)) {
    const value = Array.isArray(raw) ? raw[0] : raw
    if (value === undefined || value === "") continue
    out.push([key, value])
  }
  return out
}

/**
 * Apply `updates` to a copy of `current` and return `path?query`.
 *
 * `undefined` and `""` delete the key; any other value replaces it. Order of
 * untouched params is preserved, so URLs stay stable across navigations.
 */
export function withListParams(
  path: string,
  current: ListParams,
  updates: Record<string, string | number | undefined> = {},
): string {
  const params = new URLSearchParams()
  for (const [key, value] of entriesOf(current)) params.append(key, value)
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === "") params.delete(key)
    else params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

/**
 * URL for a specific 1-based page of a list, keeping every other param.
 * Page 1 drops `halaman` so the canonical first-page URL stays clean.
 */
export function listPageHref(path: string, current: ListParams, page: number): string {
  return withListParams(path, current, {
    halaman: page > 1 ? page : undefined,
  })
}
