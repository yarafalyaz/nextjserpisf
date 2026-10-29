/**
 * Multi-period statement columns (bulan / kuartal / tahun).
 *
 * Pure by design (no Prisma) so period boundaries are unit-testable — the
 * common bug class here is offsetting the window by one period (an exclusive
 * end that drops the anchor month, or a quarter boundary landing on the wrong
 * month).
 */

export type MultiPeriodMode = "bulan" | "kuartal" | "tahun"

export interface PeriodColumn {
  key: string
  label: string
  /** Inclusive first day, 00:00 local. */
  start: Date
  /** Inclusive last day, 23:59:59.999 local. */
  end: Date
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]

const startOfMonth = (year: number, month: number) => new Date(year, month, 1, 0, 0, 0, 0)
const endOfMonth = (year: number, month: number) => new Date(year, month + 1, 0, 23, 59, 59, 999)
const pad = (value: number) => String(value).padStart(2, "0")

function monthColumn(year: number, month: number): PeriodColumn {
  return {
    key: `${year}-${pad(month + 1)}`,
    label: `${MONTH_SHORT[month]} ${year}`,
    start: startOfMonth(year, month),
    end: endOfMonth(year, month),
  }
}

function quarterColumn(year: number, quarter: number): PeriodColumn {
  const firstMonth = quarter * 3
  return {
    key: `${year}-Q${quarter + 1}`,
    label: `Q${quarter + 1} ${year}`,
    start: startOfMonth(year, firstMonth),
    end: endOfMonth(year, firstMonth + 2),
  }
}

function yearColumn(year: number): PeriodColumn {
  return {
    key: String(year),
    label: String(year),
    start: new Date(year, 0, 1, 0, 0, 0, 0),
    end: new Date(year, 11, 31, 23, 59, 59, 999),
  }
}

/**
 * The last `count` periods ending with the one containing `anchor`, oldest first.
 */
export function buildPeriodColumns(mode: MultiPeriodMode, count: number, anchor: Date): PeriodColumn[] {
  const total = Math.max(1, Math.min(60, Math.trunc(count)))
  const columns: PeriodColumn[] = []
  const anchorYear = anchor.getFullYear()

  for (let offset = total - 1; offset >= 0; offset -= 1) {
    if (mode === "bulan") {
      const date = new Date(anchorYear, anchor.getMonth() - offset, 1)
      columns.push(monthColumn(date.getFullYear(), date.getMonth()))
    } else if (mode === "kuartal") {
      const quarterIndex = anchorYear * 4 + Math.floor(anchor.getMonth() / 3) - offset
      columns.push(quarterColumn(Math.floor(quarterIndex / 4), quarterIndex % 4))
    } else {
      columns.push(yearColumn(anchorYear - offset))
    }
  }

  return columns
}

/**
 * Validasi `jumlah` multi-periode: integer 1..36, selain itu default 12.
 * `Number("abc")` = NaN dulu lolos ke `buildPeriodColumns` (Math.trunc(NaN)
 * tetap NaN → nol kolom → 500 saat halaman membaca `columns[0]`).
 */
export function parseMultiPeriodCount(raw: string | null | undefined): number {
  if (raw == null || String(raw).trim() === "") return 12
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 36) return 12
  return value
}

export const MULTI_PERIOD_MODE_LABELS: Record<MultiPeriodMode, string> = {
  bulan: "Bulanan",
  kuartal: "Kuartalan",
  tahun: "Tahunan",
}
