/**
 * Pure time/geo helpers for self-attendance. Extracted from
 * self-attendance.actions.ts because a "use server" module may only export
 * async Server Actions — synchronous helpers exported there break the
 * production (Turbopack) build. Keeping them here also makes them unit-testable.
 */

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000

export function getWibNow(now = new Date()) {
  return new Date(now.getTime() + WIB_OFFSET_MS)
}

/** UTC-midnight Date keyed to the WIB (UTC+7) calendar day. */
export function getWibTodayUtcDate(now = new Date()) {
  const wibNow = getWibNow(now)
  return new Date(Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate()))
}

/** Day of week (0=Sunday) in the WIB timezone. */
export function getWibDayOfWeek(now = new Date()) {
  return getWibNow(now).getUTCDay()
}

/** Parse "HH:MM" into minutes-since-midnight. */
export function parseStartMinutes(startTime: string) {
  const [h, m] = startTime.split(":").map((v) => Number(v || 0))
  return h * 60 + m
}

/** Minutes-since-midnight in the WIB timezone. */
export function getWibMinutes(now = new Date()) {
  const wibNow = getWibNow(now)
  return wibNow.getUTCHours() * 60 + wibNow.getUTCMinutes()
}

/** Haversine distance in km between two lat/lng points. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
