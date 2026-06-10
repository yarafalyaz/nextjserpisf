import { prisma } from "@/lib/db/prisma"
import { getSystemSettings } from "@/lib/utils/settings"

interface LatePenaltyResult {
  totalLateMinutes: number
  totalPenalty: number
  details: {
    date: Date
    scheduledStart: string
    actualCheckIn: Date
    lateMinutes: number
    penalty: number
  }[]
}

/**
 * Calculate late penalty for an employee within a date range.
 *
 * Uses the `lateMinutes` already recorded on each Attendance row at check-in
 * (which is computed in WIB at the time of check-in), rather than recomputing
 * from the work schedule with server-local time. This keeps payroll consistent
 * with what the employee actually saw and avoids timezone drift on UTC hosts.
 */
export async function calculateLatePenalty(
  employeeId: number,
  startDate: Date,
  endDate: Date
): Promise<LatePenaltyResult> {
  const settings = await getSystemSettings()
  const rawPerMinute = Number(settings.latePenaltyPerMinute)
  // Fail safe to 0 so a missing/invalid setting can never inject NaN into payroll.
  const penaltyPerMinute = Number.isFinite(rawPerMinute) && rawPerMinute > 0 ? rawPerMinute : 0
  const rawMax = Number(settings.maxLatePenaltyMinutes)
  // Only cap when a positive finite max is configured; otherwise leave uncapped
  // (a null/undefined max previously turned lateMinutes into null -> NaN penalty).
  const maxMinutes = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : null

  const attendances = await prisma.attendance.findMany({
    where: {
      employeeId,
      date: { gte: startDate, lte: endDate },
      lateMinutes: { gt: 0 },
    },
    orderBy: { date: "asc" },
  })

  const details: LatePenaltyResult["details"] = []

  for (const attendance of attendances) {
    let lateMinutes = attendance.lateMinutes
    if (lateMinutes <= 0) continue
    if (maxMinutes !== null && lateMinutes > maxMinutes) lateMinutes = maxMinutes

    const penalty = lateMinutes * penaltyPerMinute
    details.push({
      date: attendance.date,
      scheduledStart: "",
      actualCheckIn: attendance.checkIn ?? attendance.date,
      lateMinutes,
      penalty,
    })
  }

  const totalLateMinutes = details.reduce((sum, d) => sum + d.lateMinutes, 0)
  const totalPenalty = details.reduce((sum, d) => sum + d.penalty, 0)

  return { totalLateMinutes, totalPenalty, details }
}

/**
 * Get late penalty summary for payroll display.
 */
export async function getLatePenaltySummary(
  employeeId: number,
  startDate: Date,
  endDate: Date
) {
  const result = await calculateLatePenalty(employeeId, startDate, endDate)
  return {
    totalLateMinutes: result.totalLateMinutes,
    totalPenalty: result.totalPenalty,
    lateDays: result.details.length,
    details: result.details,
  }
}
