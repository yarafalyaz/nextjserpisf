/**
 * Query-free report URLs.
 *
 *   /laporan/<laporan>/<periode>[/<kunci>/<nilai>...]
 *
 * `<periode>` is a slug from `report-period.ts` (`2026-10`, `2026`,
 * `2026-10-12`, `2026-01-01_2026-10-13`). Every other filter follows as
 * key/value pairs, which keeps the URL readable and, unlike a bare `/a/b/c`
 * tail, stays correct when a filter is omitted: there is no placeholder segment
 * to fill and the order is irrelevant, so adding a filter later cannot change
 * the meaning of an existing link.
 *
 * Pure by design (no Prisma) so the parsing is unit-testable — a link that
 * silently drops a filter shows the wrong numbers without any error.
 */

export type ReportFilterValue = string | number | null | undefined

/** Rangkaikan filter menjadi segmen path. Nilai kosong dilewati. */
export function encodeReportFilters(filters: Record<string, ReportFilterValue>): string[] {
  const segments: string[] = []
  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined || value === "") continue
    segments.push(key, String(value))
  }
  return segments
}

/**
 * Baca kembali pasangan kunci/nilai dari segmen setelah periode.
 *
 * Segmen terakhir yang menggantung (tanpa pasangan) diabaikan, sehingga URL
 * yang terpotong saat disalin tetap menampilkan laporan alih-alih error.
 */
export function parseReportFilters(segments: string[]): Record<string, string> {
  const filters: Record<string, string> = {}
  for (let index = 0; index + 1 < segments.length; index += 2) {
    const key = segments[index]
    if (!key) continue
    filters[key] = segments[index + 1]
  }
  return filters
}

/**
 * URL lengkap sebuah laporan: periode + filter seluruhnya di path.
 *
 * `periodSlug` boleh kosong untuk laporan yang tidak punya periode sama sekali
 * (mis. valuasi stok: `/laporan/valuasi-stok/gudang/gudang-utama`); segmennya
 * cukup dihilangkan, tidak menyisakan garis miring ganda.
 */
export function buildReportHref(
  basePath: string,
  periodSlug: string | null | undefined,
  filters: Record<string, ReportFilterValue> = {},
): string {
  return [basePath, periodSlug, ...encodeReportFilters(filters)]
    .filter((segment): segment is string => Boolean(segment))
    .join("/")
}
