/**
 * Month grid for the calendar view.
 *
 * Pure by design (no Prisma) so the Monday-first week alignment is unit-testable —
 * an off-by-one here shifts every event chip into the neighbouring day.
 */

export interface CalendarDay {
  date: Date
  /** Local YYYY-MM-DD, used as the map key for events. */
  key: string
  inMonth: boolean
  isToday: boolean
}

export function toDayKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** "YYYY-MM" for a month param, falling back to the anchor's own month. */
export function parseMonthParam(raw: string | undefined, anchor: Date): { year: number; month: number } {
  const match = raw?.match(/^(\d{4})-(\d{2})$/)
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2]) - 1
    if (month >= 0 && month <= 11) return { year, month }
  }
  return { year: anchor.getFullYear(), month: anchor.getMonth() }
}

/**
 * Six Monday-first weeks covering the month (42 cells, fixed height so the
 * layout does not jump between months).
 */
export function buildMonthGrid(year: number, month: number, today: Date): CalendarDay[][] {
  const firstOfMonth = new Date(year, month, 1)
  // getDay(): 0 = Sunday. Monday-first offset: Mon → 0 … Sun → 6.
  const offset = (firstOfMonth.getDay() + 6) % 7
  const start = new Date(year, month, 1 - offset)
  const todayKey = toDayKey(today)

  const weeks: CalendarDay[][] = []
  for (let week = 0; week < 6; week += 1) {
    const days: CalendarDay[] = []
    for (let day = 0; day < 7; day += 1) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + week * 7 + day)
      const key = toDayKey(date)
      days.push({ date, key, inMonth: date.getMonth() === month, isToday: key === todayKey })
    }
    weeks.push(days)
  }
  return weeks
}

export const WEEKDAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"]

export const MONTH_LABELS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]

export function previousMonth(year: number, month: number) {
  return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
}

export function nextMonth(year: number, month: number) {
  return month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }
}

export function monthParam(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`
}
