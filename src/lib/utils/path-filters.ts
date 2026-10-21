/**
 * Filter URL berbentuk pasangan kunci/nilai di PATH, pola yang sama dengan
 * filter laporan (`/laporan/<laporan>/<periode>/<kunci>/<nilai>`) dan yang
 * dipakai daftar absensi (`/sdm/absensi/tanggal/2026-09-30`).
 *
 * Mengembalikan objek pasangan untuk segmen yang valid, `{}` untuk URL
 * tanpa filter, dan `null` untuk kunci tak dikenal / jumlah segmen ganjil /
 * nilai yang tidak lolos validator — pemanggil biasanya menerjemahkan
 * `null` menjadi `notFound()`.
 */
export function parsePathFilterSegments(
  segments: string[] | undefined,
  validators: Record<string, RegExp>,
): Record<string, string> | null {
  if (!segments?.length) return {}
  if (segments.length % 2 !== 0) return null
  const parsed: Record<string, string> = {}
  for (let i = 0; i < segments.length; i += 2) {
    const key = segments[i]
    const value = segments[i + 1]
    const validator = validators[key]
    if (!validator || !validator.test(value)) return null
    parsed[key] = value
  }
  return parsed
}

/** Susun path dari pasangan filter (urutan mengikuti urutan kunci objek). */
export function buildPathFilterHref(
  basePath: string,
  pairs: Record<string, string | undefined>,
): string {
  const parts = Object.entries(pairs)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .flatMap(([key, value]) => [key, value])
  return parts.length ? `${basePath}/${parts.join("/")}` : basePath
}
