/**
 * Recurrence arithmetic for scheduled transactions.
 *
 * Pure by design (no Prisma) so the two bug classes that matter here are
 * unit-testable: month-end clamping (31 Jan + 1 bulan must be 28/29 Feb, not
 * 3 Mar) and catch-up when the scheduler has not run for several periods.
 */

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "yearly"

export const FREQUENCIES: RecurrenceFrequency[] = ["daily", "weekly", "monthly", "quarterly", "yearly"]

export const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  daily: "Harian",
  weekly: "Mingguan",
  monthly: "Bulanan",
  quarterly: "Kuartalan",
  yearly: "Tahunan",
}

export function isRecurrenceFrequency(value: string): value is RecurrenceFrequency {
  return (FREQUENCIES as string[]).includes(value)
}

const MONTHS_BY_FREQUENCY: Partial<Record<RecurrenceFrequency, number>> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
}

/** Last day of a month (0-indexed month). */
function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

/**
 * Add `interval` periods, clamping the day to the target month's length so a
 * schedule anchored on the 31st does not silently drift into the next month.
 */
export function addFrequency(date: Date, frequency: RecurrenceFrequency, interval = 1): Date {
  const step = Math.max(1, Math.trunc(interval))
  const months = MONTHS_BY_FREQUENCY[frequency]

  if (months === undefined) {
    const days = frequency === "weekly" ? 7 : 1
    const next = new Date(date)
    next.setDate(next.getDate() + days * step)
    return next
  }

  const anchorDay = date.getDate()
  const targetMonthIndex = date.getMonth() + months * step
  const targetYear = date.getFullYear() + Math.floor(targetMonthIndex / 12)
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12
  const day = Math.min(anchorDay, lastDayOfMonth(targetYear, targetMonth))
  return new Date(targetYear, targetMonth, day, date.getHours(), date.getMinutes(), date.getSeconds(), 0)
}

export function isDue(nextRunDate: Date, asOf: Date = new Date()): boolean {
  return nextRunDate.getTime() <= asOf.getTime()
}

/**
 * First schedule instant strictly after `asOf`, so a scheduler that was offline
 * for N periods advances past every missed occurrence instead of firing them all.
 */
export function nextRunAfter(
  from: Date,
  frequency: RecurrenceFrequency,
  interval = 1,
  asOf: Date = new Date(),
): Date {
  let next = new Date(from)
  // Bounded loop: 60 years of dailies is far beyond any realistic gap, and the
  // bound prevents an infinite loop if a template carries a corrupt date.
  for (let guard = 0; guard < 25_000 && next.getTime() <= asOf.getTime(); guard += 1) {
    next = addFrequency(next, frequency, interval)
  }
  return next
}

export function describeSchedule(frequency: RecurrenceFrequency, interval = 1): string {
  const label = FREQUENCY_LABELS[frequency]
  return interval > 1 ? `${label} (setiap ${interval}x)` : label
}

/** Whether a template still runs at `date` (endDate is inclusive). */
export function isWithinSchedule(date: Date, startDate: Date, endDate: Date | null): boolean {
  if (date.getTime() < startDate.getTime()) return false
  if (endDate && date.getTime() > endDate.getTime()) return false
  return true
}
