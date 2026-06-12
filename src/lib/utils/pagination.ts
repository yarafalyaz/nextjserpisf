/**
 * Helpers for server-side pagination driven by URL query params.
 *
 * Pages read `halaman` (1-based page number) and `pageSize` (default 100) from
 * `searchParams`, run a `prisma.findMany({ skip, take })` plus a `prisma.count`,
 * and pass the total/page/pageSize to the client `DataTable`, which then wires
 * the page controls back to the URL via `?halaman=N`.
 */
export const DEFAULT_PAGE_SIZE = 100

export interface PageParams {
  halaman?: string | string[] | undefined
  pageSize?: string | string[] | undefined
}

export interface ParsedPagination {
  page: number
  pageSize: number
  skip: number
  take: number
}

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

/** Parse `halaman`/`pageSize` from searchParams with safe fallbacks. */
export function parsePagination(
  params: PageParams | (Record<string, string | string[] | undefined>) | undefined,
): ParsedPagination {
  const rawPage = first((params as PageParams | undefined)?.halaman)
  const rawSize = first((params as PageParams | undefined)?.pageSize)

  const page = Math.max(1, Number.parseInt(rawPage ?? "", 10) || 1)
  const pageSize = Math.max(
    1,
    Math.min(500, Number.parseInt(rawSize ?? "", 10) || DEFAULT_PAGE_SIZE),
  )
  const skip = (page - 1) * pageSize

  return { page, pageSize, skip, take: pageSize }
}
