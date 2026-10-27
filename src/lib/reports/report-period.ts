/**
 * Pretty period slugs for the financial statements.
 *
 * Accepted forms (shortest wins when generating):
 *   /laporan/laba-rugi/2026-10                  → 1–31 Okt 2026
 *   /laporan/laba-rugi/2026                     → 1 Jan – 31 Des 2026
 *   /laporan/neraca/2026-10-12                  → posisi per 12 Okt 2026
 *   /laporan/laba-rugi/2026-01-01_2026-10-12    → rentang bebas
 *
 * Pure by design (no Prisma) so the boundary maths is unit-testable — an
 * off-by-one here silently drops the first or last day of the period.
 */

import { parseLocalDateOnly, toLocalDateOnly } from "@/lib/utils/date-only"
import { parseReportFilters } from "@/lib/reports/report-href"

export interface ReportPeriod {
  /** Awal periode (00:00:00.000). */
  start: Date
  /** Akhir periode (23:59:59.999). */
  end: Date
  /** Slug kanonik untuk periode ini. */
  slug: string
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTH = /^(\d{4})-(\d{2})$/
const YEAR = /^(\d{4})$/

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

function pad(value: number) {
  return String(value).padStart(2, "0")
}

/**
 * Benarkah (tahun, bulan 1–12, hari) tanggal kalender yang nyata?
 *
 * Konstruktor `Date` menggeser tanggal mustahil diam-diam (`2026-02-31`
 * menjadi 3 Mar 2026), jadi hari wajib diperiksa terhadap jumlah hari
 * bulan itu — termasuk kabisat — SEBELUM tanggal dibangun. Tanggal
 * mustahil diperlakukan sama seperti bulan 13: ditolak ke fallback.
 */
function isValidCalendarDay(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false
  return day <= new Date(year, month, 0).getDate()
}

/** Validasi string `YYYY-MM-DD`; bentuk lain diserahkan ke `parseReportPeriod`. */
function isValidDateOnlyString(value: string): boolean {
  const match = DAY.exec(value)
  if (!match) return true
  return isValidCalendarDay(Number(match[1]), Number(match[2]), Number(match[3]))
}

export function buildReportPeriodSlug(start: Date, end: Date): string {
  const sameDay = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth() && start.getDate() === end.getDate()
  if (sameDay) return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`

  const wholeMonth =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === 1 &&
    end.getDate() === new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate()
  if (wholeMonth) return `${start.getFullYear()}-${pad(start.getMonth() + 1)}`

  const wholeYear =
    wholeMonth === false &&
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === 0 &&
    start.getDate() === 1 &&
    end.getMonth() === 11 &&
    end.getDate() === 31
  if (wholeYear) return String(start.getFullYear())

  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}_${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`
}

/**
 * Parses a period slug. Anything unrecognised falls back to `fallback`
 * (typically "hari ini" or "tahun berjalan") instead of throwing, so a stale
 * bookmark never breaks the report.
 */
export function parseReportPeriod(raw: string | undefined, fallback: { start: Date; end: Date }): ReportPeriod {
  const fallbackPeriod = (): ReportPeriod => ({
    start: startOfDay(fallback.start),
    end: endOfDay(fallback.end),
    slug: buildReportPeriodSlug(fallback.start, fallback.end),
  })

  if (!raw) return fallbackPeriod()

  const rangeParts = raw.split("_")
  if (rangeParts.length === 2) {
    const from = DAY.exec(rangeParts[0])
    const to = DAY.exec(rangeParts[1])
    if (!from || !to) return fallbackPeriod()
    if (
      !isValidCalendarDay(Number(from[1]), Number(from[2]), Number(from[3])) ||
      !isValidCalendarDay(Number(to[1]), Number(to[2]), Number(to[3]))
    ) {
      return fallbackPeriod()
    }
    const start = new Date(Number(from[1]), Number(from[2]) - 1, Number(from[3]))
    const end = new Date(Number(to[1]), Number(to[2]) - 1, Number(to[3]))
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return fallbackPeriod()
    return { start: startOfDay(start), end: endOfDay(end), slug: buildReportPeriodSlug(start, end) }
  }

  const day = DAY.exec(raw)
  if (day) {
    if (!isValidCalendarDay(Number(day[1]), Number(day[2]), Number(day[3]))) return fallbackPeriod()
    const date = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]))
    if (Number.isNaN(date.getTime())) return fallbackPeriod()
    return { start: startOfDay(date), end: endOfDay(date), slug: buildReportPeriodSlug(date, date) }
  }

  const month = MONTH.exec(raw)
  if (month) {
    const monthIndex = Number(month[2]) - 1
    if (monthIndex < 0 || monthIndex > 11) return fallbackPeriod()
    const start = new Date(Number(month[1]), monthIndex, 1)
    const end = new Date(Number(month[1]), monthIndex + 1, 0)
    return { start: startOfDay(start), end: endOfDay(end), slug: buildReportPeriodSlug(start, end) }
  }

  const year = YEAR.exec(raw)
  if (year) {
    const start = new Date(Number(year[1]), 0, 1)
    const end = new Date(Number(year[1]), 11, 31)
    return { start: startOfDay(start), end: endOfDay(end), slug: buildReportPeriodSlug(start, end) }
  }

  return fallbackPeriod()
}


/** Label Indonesia, mis. "Periode 1 Okt 2026 – 31 Okt 2026". */
export function formatPeriodLabel(period: Pick<ReportPeriod, "start" | "end">): string {
  const format = (date: Date) => date.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
  return period.start.getTime() === period.end.getTime() ? `Per ${format(period.start)}` : `Periode ${format(period.start)} – ${format(period.end)}`
}

/**
 * Benarkah segmen ini berbentuk slug periode?
 *
 * Dipakai laporan yang boleh tanpa periode di alamat (mis. valuasi stok:
 * `/laporan/valuasi-stok/gudang/gudang-utama`). Tanpa pemeriksaan ini, segmen
 * pertama yang sebenarnya kunci filter akan salah dibaca sebagai periode.
 */
export function looksLikePeriodSlug(raw: string | undefined): boolean {
  if (!raw) return false
  const rangeParts = raw.split("_")
  if (rangeParts.length === 2) return DAY.test(rangeParts[0]) && DAY.test(rangeParts[1])
  return DAY.test(raw) || MONTH.test(raw) || YEAR.test(raw)
}

/**
 * Pisahkan segmen rute menjadi periode (bila ada) + pasangan filter.
 *
 *   ["2026-10", "barang", "busi"]  → periode 2026-10, { barang: "busi" }
 *   ["gudang", "gudang-utama"]     → tanpa periode, { gudang: "gudang-utama" }
 */
export function splitReportSegments(segments: string[]): {
  periodSlug?: string
  filters: Record<string, string>
} {
  const [first, ...rest] = segments
  if (looksLikePeriodSlug(first)) return { periodSlug: first, filters: parseReportFilters(rest) }
  return { filters: parseReportFilters(segments) }
}

/**
 * Resolve the period of a report page from its route segments.
 *
 * The period lives in the path (`/laporan/pajak/2026-10`), but links built
 * before the move still carry `?tanggalMulai=&tanggalSelesai=` — those are still
 * honoured, because silently falling back to a default would show different
 * numbers than the reader expects with no error at all.
 *
 * Server-only (it awaits Next's params promises). Keeping the rule here means
 * every report reads its period the same way.
 */
export async function reportPeriodFromRoute(
  routeParams: Promise<{ segments?: string[] }>,
  searchParams: Promise<Record<string, string | undefined>>,
  fallback: (now: Date) => { start: Date; end: Date },
  options: { legacyParam?: string } = {},
): Promise<ReportPeriod> {
  const [{ segments = [] }, search] = await Promise.all([routeParams, searchParams])
  const now = new Date()

  // Tautan lama membawa periode di query string. Nama paramnya tidak selalu
  // sama: laporan memakai tanggalMulai/tanggalSelesai, stok opname `date`,
  // serapan overhead `periode`.
  const startParam = options.legacyParam ?? "tanggalMulai"
  const endParam = options.legacyParam ?? "tanggalSelesai"
  const legacyStart = search[startParam]
  const legacyEnd = search[endParam]

  // Tautan lama berpasangan (tanggalMulai/tanggalSelesai): dulu tanggal selesai
  // yang kosong berarti "sampai hari ini", bukan satu hari. Param tunggal
  // (opname `date`, serapan `periode`) tidak diperlakukan begitu.
  const legacyRangeEnd = legacyEnd ?? (options.legacyParam ? undefined : toLocalDateOnly(new Date()))

  // Tanggal mustahil pada tautan lama (mis. tanggalSelesai=2026-02-31)
  // ditolak seperti bulan 13 — pasangan legacy gugur ke fallback, bukan
  // bergeser diam-diam ke bulan berikutnya lewat konstruktor Date.
  const legacyValid =
    (!legacyStart || isValidDateOnlyString(legacyStart)) &&
    (!legacyRangeEnd || isValidDateOnlyString(legacyRangeEnd))

  // Nilai legacy diteruskan apa adanya bila sudah berbentuk yang dikenali
  // parseReportPeriod (2026, 2026-10, 2026-10-13); rentang dua tanggal dirangkai
  // menjadi slug.
  const legacyCandidate = legacyStart && legacyValid
    ? legacyRangeEnd && legacyRangeEnd !== legacyStart
      ? buildReportPeriodSlug(parseLocalDateOnly(legacyStart), parseLocalDateOnly(legacyRangeEnd))
      : legacyStart
    : undefined

  return parseReportPeriod(segments[0] ?? legacyCandidate, fallback(now))
}

/** Fallback periode tahun berjalan (1 Jan – hari ini) untuk laporan. */
export function reportYearToDatePeriod(now: Date): { start: Date; end: Date } {
  return { start: new Date(now.getFullYear(), 0, 1), end: now }
}
