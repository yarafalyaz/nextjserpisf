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
 * Logic:
 * 1. Get employee's attendance records in the period
 * 2. For each attendance, find the applicable WorkSchedule (by dayOfWeek + department)
 * 3. Compare checkIn time vs schedule startTime + lateToleranceMinutes
 * 4. If late, calculate: lateMinutes * latePenaltyPerMinute (capped at maxLatePenaltyMinutes)
 */
export async function calculateLatePenalty(
  employeeId: number,
  startDate: Date,
  endDate: Date
): Promise<LatePenaltyResult> {
  const settings = await getSystemSettings()
  const penaltyPerMinute = Number(settings.latePenaltyPerMinute)
  const maxMinutes = settings.maxLatePenaltyMinutes

  // Get employee with department
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, departmentId: true },
  })

  if (!employee) {
    return { totalLateMinutes: 0, totalPenalty: 0, details: [] }
  }

  // Get attendance records with check-in
  const attendances = await prisma.attendance.findMany({
    where: {
      employeeId,
      date: { gte: startDate, lte: endDate },
      checkIn: { not: null },
    },
    orderBy: { date: "asc" },
  })

  // Get applicable work schedules (by department or global)
  const schedules = await prisma.workSchedule.findMany({
    where: {
      isActive: true,
      OR: [
        { departmentId: employee.departmentId },
        { departmentId: null },
      ],
    },
  })

  const details: LatePenaltyResult["details"] = []

  for (const attendance of attendances) {
    if (!attendance.checkIn) continue

    const dayOfWeek = attendance.date.getDay() // 0=Sunday, 1=Monday...

    // Find schedule for this day (prefer department-specific over global)
    const schedule =
      schedules.find(
        (s) => s.dayOfWeek === dayOfWeek && s.departmentId === employee.departmentId
      ) ?? schedules.find((s) => s.dayOfWeek === dayOfWeek && s.departmentId === null)

    if (!schedule) continue

    // Parse schedule start time (format: "HH:mm" or "HH:mm:ss")
    const [startHour, startMinute] = schedule.startTime.split(":").map(Number)
    const tolerance = schedule.lateToleranceMinutes

    // Build scheduled start datetime
    const scheduledStart = new Date(attendance.date)
    scheduledStart.setHours(startHour, startMinute, 0, 0)

    // Add tolerance
    const deadlineMs = scheduledStart.getTime() + tolerance * 60 * 1000
    const checkInMs = attendance.checkIn.getTime()

    if (checkInMs > deadlineMs) {
      // Late!
      let lateMinutes = Math.ceil((checkInMs - deadlineMs) / (60 * 1000))

      // Cap at max
      if (lateMinutes > maxMinutes) {
        lateMinutes = maxMinutes
      }

      const penalty = lateMinutes * penaltyPerMinute

      details.push({
        date: attendance.date,
        scheduledStart: schedule.startTime,
        actualCheckIn: attendance.checkIn,
        lateMinutes,
        penalty,
      })
    }
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
