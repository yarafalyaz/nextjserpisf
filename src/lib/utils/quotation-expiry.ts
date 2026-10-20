import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

// F-36 UI: selaras assertQuotationNotExpired di sales.actions — validUntil
// tengah malam UTC hari kalender WIB; hari validUntil sendiri masih berlaku.
export function isQuotationExpired(
  validUntil: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!validUntil) return false
  const until = validUntil instanceof Date ? validUntil : new Date(validUntil)
  if (Number.isNaN(until.getTime())) return false
  return getWibTodayUtcDate(now).getTime() > until.getTime()
}
