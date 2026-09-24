import { prisma } from "@/lib/db/prisma"
import { getSystemSettings } from "@/lib/utils/settings"
import { endOfUtcDayExclusive } from "@/lib/utils/date-only"

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
 * Calculate late penalties using the minutes recorded at check-in.
 */
export async function calculateLatePenalty(
  employeeId: number,
  startDate: Date,
  endDate: Date
): Promise<LatePenaltyResult> {
  const [settings, attendances] = await Promise.all([
    getSystemSettings(),
    prisma.attendance.findMany({
      where: {
        employeeId,
        // Half-open upper bound. attendance.date holds UTC-midnight values keyed
        // to the WIB calendar day, so `lte: endDate` only matched the last day
        // while every row was stored at exactly midnight — a row carrying a time
        // component (external attendance source) silently dropped the whole day.
        date: { gte: startDate, lt: endOfUtcDayExclusive(endDate) },
        lateMinutes: { gt: 0 },
      },
      orderBy: { date: "asc" },
    }),
  ])
  const perMinute = Number(settings.latePenaltyPerMinute)
  const maxConfigured = Number(settings.maxLatePenaltyMinutes)
  const penaltyPerMinute = Number.isFinite(perMinute) && perMinute > 0 ? perMinute : 0
  const maxMinutes = Number.isFinite(maxConfigured) && maxConfigured > 0 ? maxConfigured : null

  const details = attendances.flatMap((attendance) => {
    const minutes = maxMinutes == null
      ? attendance.lateMinutes
      : Math.min(attendance.lateMinutes, maxMinutes)
    if (minutes <= 0) return []
    return [{
      date: attendance.date,
      scheduledStart: "",
      actualCheckIn: attendance.checkIn ?? attendance.date,
      lateMinutes: minutes,
      penalty: minutes * penaltyPerMinute,
    }]
  })
  return {
    totalLateMinutes: details.reduce((sum, detail) => sum + detail.lateMinutes, 0),
    totalPenalty: details.reduce((sum, detail) => sum + detail.penalty, 0),
    details,
  }
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
