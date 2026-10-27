/**
 * Tarif lembur menurut PP 35/2021 jo. Kepmenakertrans 102/MEN/VI/2004.
 *
 * Upah sejam = 1/173 x upah sebulan. Pengali bertingkat:
 * - Hari kerja: jam pertama 1,5x, jam berikutnya 2x.
 * - Hari istirahat/libur, pola 5 hari kerja: 8 jam pertama 2x, jam ke-9
 *   3x, jam ke-10 dan ke-11 4x.
 * - Hari istirahat/libur, pola 6 hari kerja: 7 jam pertama 2x, jam ke-8
 *   3x, jam ke-9 dan ke-10 4x.
 * Jam di luar tabel dibayar pada tarif tertinggi tabelnya.
 *
 * Batas lembur (Pasal 26 PP 35/2021): maksimal 4 jam sehari dan 18 jam
 * seminggu pada hari kerja; lembur hari istirahat/libur TIDAK termasuk
 * dalam batas itu.
 */

export const HOURLY_DIVISOR = 173
export const MAX_OVERTIME_HOURS_PER_WORKDAY = 4
export const MAX_OVERTIME_HOURS_PER_WEEK = 18

export type OvertimeDayKind = "workday" | "rest_5day" | "rest_6day"

const TIERS: Record<OvertimeDayKind, { upTo: number; rate: number }[]> = {
  workday: [
    { upTo: 1, rate: 1.5 },
    { upTo: Number.POSITIVE_INFINITY, rate: 2 },
  ],
  rest_5day: [
    { upTo: 8, rate: 2 },
    { upTo: 9, rate: 3 },
    { upTo: Number.POSITIVE_INFINITY, rate: 4 },
  ],
  rest_6day: [
    { upTo: 7, rate: 2 },
    { upTo: 8, rate: 3 },
    { upTo: Number.POSITIVE_INFINITY, rate: 4 },
  ],
}

/** Nilai lembur (rupiah, dibulatkan) untuk satu pengajuan. */
export function computeOvertimePay(input: {
  monthlySalary: number
  hours: number
  dayKind: OvertimeDayKind
}): number {
  const { monthlySalary, hours, dayKind } = input
  if (monthlySalary <= 0 || hours <= 0) return 0
  const hourly = monthlySalary / HOURLY_DIVISOR
  let remaining = hours
  let lowerBound = 0
  let total = 0
  for (const tier of TIERS[dayKind]) {
    if (remaining <= 0) break
    const tierHours = Math.min(remaining, tier.upTo - lowerBound)
    total += tierHours * tier.rate * hourly
    remaining -= tierHours
    lowerBound = tier.upTo
  }
  return Math.round(total)
}

/** Senin 00:00 (lokal) dari minggu yang memuat tanggal ini. */
export function startOfWeekMonday(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay() // 0 Minggu .. 6 Sabtu
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return d
}

export function endOfWeekSunday(date: Date): Date {
  const start = startOfWeekMonday(date)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return end
}

type OvertimeLimitDb = {
  overtimeRequest: {
    findMany: (args: {
      where: Record<string, unknown>
      select: { hours: true; date?: true }
    }) => Promise<{ hours: unknown; date?: Date }[]>
  }
}

/**
 * Gerbang batas lembur PP 35/2021 Pasal 26 ayat (1) — dipakai create DAN
 * update (syarat vonis K2-S1): maksimal 4 jam sehari dan 18 jam seminggu
 * pada HARI KERJA; lembur hari istirahat/libur resmi di luar batas itu.
 * Baris pending+approved terhitung; `excludeId` mengeluarkan baris yang
 * sedang diedit dari hitungannya sendiri.
 */
export async function assertOvertimeWithinWorkdayLimits(
  db: OvertimeLimitDb,
  resolveDay: (employeeId: number, date: Date) => Promise<{ isWorkingDay: boolean }>,
  input: { employeeId: number; date: Date; hours: number; excludeId?: number },
): Promise<void> {
  const { employeeId, date, hours, excludeId } = input
  const dayProfile = await resolveDay(employeeId, date)
  if (!dayProfile.isWorkingDay) return
  const exclude = excludeId ? { id: { not: excludeId } } : {}
  const sameDay = await db.overtimeRequest.findMany({
    where: {
      employeeId,
      date,
      status: { in: ["pending", "approved"] },
      ...exclude,
    },
    select: { hours: true },
  })
  const dayTotal = sameDay.reduce((s, r) => s + Number(r.hours), 0) + hours
  if (dayTotal > MAX_OVERTIME_HOURS_PER_WORKDAY) {
    throw new Error(
      `Lembur hari kerja maksimal ${MAX_OVERTIME_HOURS_PER_WORKDAY} jam sehari (sudah ada ${dayTotal - hours} jam pada tanggal ini).`,
    )
  }
  const weekRows = await db.overtimeRequest.findMany({
    where: {
      employeeId,
      date: { gte: startOfWeekMonday(date), lte: endOfWeekSunday(date) },
      status: { in: ["pending", "approved"] },
      ...exclude,
    },
    select: { hours: true, date: true },
  })
  let weekWorkdayHours = hours
  for (const r of weekRows) {
    const p = await resolveDay(employeeId, r.date as Date)
    if (p.isWorkingDay) weekWorkdayHours += Number(r.hours)
  }
  if (weekWorkdayHours > MAX_OVERTIME_HOURS_PER_WEEK) {
    throw new Error(
      `Lembur hari kerja maksimal ${MAX_OVERTIME_HOURS_PER_WEEK} jam seminggu.`,
    )
  }
}
