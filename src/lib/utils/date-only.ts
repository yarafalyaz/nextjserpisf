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
 * Inverse of `toLocalDateOnly`: local midnight for a `YYYY-MM-DD` string.
 *
 * The explicit `T00:00:00` matters — `new Date("2026-09-01")` is spec'd as UTC
 * midnight, which in WIB is 07:00 on the same day but a day earlier west of
 * UTC, so the round-trip through `toLocalDateOnly` would not be exact.
 */
export function parseLocalDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00`)
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

/**
 * Geser instan ke jam dinding WIB (UTC+7, tanpa DST) lalu baca komponen UTC.
 * Indonesia tidak memberlakukan DST, jadi offsetnya tetap — hasilnya identik
 * dengan `wibDateKeyParts`/`wibPartsKey` (Intl `Asia/Jakarta`) tetapi tanpa
 * membangun formatter per baris (bucket laporan bisa puluhan ribu entri).
 * Kesetaraan kedua jalur itu dipaku oleh test `date-only-wib.test.ts`.
 */
function wibShifted(date: Date): Date {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000)
}

/**
 * `YYYY-MM-DD` hari kalender WIB dari sebuah instan.
 *
 * Dipakai untuk tanggal yang bisa berupa dua bentuk sekaligus: nilai tengah
 * malam UTC hasil `wibDateToUtcMidnight` (tanggal dokumen) DAN instan nyata
 * seperti `paymentDate: new Date()`. Untuk keduanya, hari kalender WIB adalah
 * jawaban yang benar, dan di WIB helper ini sama persis dengan komponen UTC
 * untuk nilai tengah malam — jadi tidak ada tanggal dokumen yang bergeser.
 * Getter lokal proses (`getDate()`) salah untuk keduanya di proses non-WIB.
 */
export function wibDateOnly(date: Date): string {
  const d = wibShifted(date)
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, "0"),
    String(d.getUTCDate()).padStart(2, "0"),
  ].join("-")
}

/**
 * `YYYY-MM` bulan kalender WIB — kunci bucket bulan (arus kas, tren penjualan).
 * Untuk nilai tengah malam UTC hasilnya sama dengan komponen UTC, sedangkan
 * untuk instan nyata ia mengikuti hari bisnis WIB. Getter lokal menggeser
 * tanggal 1 ke bulan sebelumnya di proses barat UTC.
 */
export function wibPeriodKey(date: Date): string {
  const d = wibShifted(date)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

/** `YYYYMM` (tanpa pemisah) bulan kalender WIB — prefiks nomor jurnal. */
export function wibYearMonthCompact(date: Date): string {
  const d = wibShifted(date)
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}
