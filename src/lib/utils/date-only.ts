/**
 * Date-only helpers. Two conventions live side by side in this codebase, and
 * mixing them shifts dates by a day, so both are spelled out explicitly here.
 *
 * 1. `toLocalDateOnly` — the `YYYY-MM-DD` value a user sees in a date input.
 *    Built from LOCAL calendar components. Never derive it with
 *    `toISOString().split("T")[0]`: in any timezone east of UTC (this app runs
 *    with TZ=Asia/Jakarta) local midnight is the previous day in UTC, so the ISO
 *    form returns the wrong calendar day (2026-09-01 came out as 2026-08-31,
 *    which shifted every report preset by one day).
 *
 * 2. UTC-midnight values keyed to the Jakarta (WIB) calendar day — see
 *    `getWibTodayUtcDate` in attendance-time.ts. `attendance.date` and friends
 *    are stored this way, so date-range filters over them compare against
 *    UTC-midnight bounds and use a HALF-OPEN upper bound
 *    (`endOfUtcDayExclusive`) so a row stored later in the end day is not
 *    silently dropped.
 */

/** `YYYY-MM-DD` for the LOCAL calendar day of `date`. */
export function toLocalDateOnly(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

/**
 * Exclusive upper bound for a range over UTC-midnight date values: the UTC
 * midnight that starts the day after `date`'s UTC calendar day.
 *
 * Use as `where: { date: { gte: start, lt: endOfUtcDayExclusive(end) } }` so the
 * whole end day is included regardless of the time component stored on a row.
 */
export function endOfUtcDayExclusive(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1),
  )
}
