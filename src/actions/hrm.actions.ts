"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { computeBpjsEmployee, computePph21Monthly } from "@/lib/services/payroll-statutory.service"
import { prisma } from "@/lib/db/prisma"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { revalidatePath } from "next/cache"
import { requireId, safeId, requireNumber, safeNumber } from "@/lib/utils/safe-parse"
import { parseFormData } from "@/lib/validations/parse-form"
import { attendanceSchema, leaveRequestSchema, overtimeRequestSchema, employeeLoanSchema, timesheetSchema, workScheduleSchema, holidaySchema, departmentHolidaySchema, appreciationSchema } from "@/lib/validations/hrm.schemas"
import { calculateLatePenalty } from "@/lib/services/late-penalty.service"
import { calculateAttendanceSummary } from "@/lib/services/attendance-summary.service"
import { syncNationalHolidays as syncNationalHolidaysService } from "@/lib/services/holiday-sync.service"
import { logActivity } from "@/lib/services/activity-log.service"
import { onPayrollPaid } from "@/lib/hooks/accounting.hook"
import { getSystemSettings } from "@/lib/utils/settings"

function getWibNow(now = new Date()) {
  const wibOffset = 7 * 60 * 60 * 1000
  return new Date(now.getTime() + wibOffset)
}

function getWibDateOnly(now = new Date()) {
  const wibNow = getWibNow(now)
  return new Date(Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate()))
}

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map((v) => Number(v || 0))
  return h * 60 + m
}

/** Menit irisan antara periode kerja [inMin,outMin] dengan jam istirahat (ISOMA). */
function breakOverlapMinutes(inMin: number, outMin: number, breakStart?: string | null, breakEnd?: string | null): number {
  if (!breakStart || !breakEnd) return 0
  const bs = toMinutes(breakStart)
  const be = toMinutes(breakEnd)
  if (be <= bs || outMin <= inMin) return 0
  return Math.max(0, Math.min(outMin, be) - Math.max(inMin, bs))
}

async function resolveWorkSchedule(employeeId: number | null | undefined, departmentId: number | null | undefined, dayOfWeek: number) {
  const schedules = await prisma.workSchedule.findMany({
    where: { isActive: true },
    include: { employees: { select: { id: true } }, departments: { select: { id: true } } },
  })
  const onDay = schedules.filter((s) =>
    s.workDays.split(",").map((d) => Number(d.trim())).includes(dayOfWeek)
  )
  return (
    onDay.find((s) => employeeId != null && s.employees.some((e) => e.id === employeeId)) ??
    onDay.find((s) => s.employees.length === 0 && departmentId != null && s.departments.some((d) => d.id === departmentId)) ??
    onDay.find((s) => s.employees.length === 0 && s.departments.length === 0) ??
    null
  )
}

// ==================== ATTENDANCE ACTIONS ====================

export async function checkIn(employeeId: number, latitude?: number, longitude?: number) {
  try {
  await requirePermission("create_attendance")

  const now = new Date()
  const wibNow = getWibNow(now)
  const today = getWibDateOnly(now)

  // Check if already checked in today
  const existing = await prisma.attendance.findFirst({
    where: { employeeId, date: today },
  })
  if (existing) {
    throw new Error("Sudah check-in hari ini")
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { departmentId: true },
  })
  if (!employee) throw new Error("Karyawan tidak ditemukan")

  // Hari libur (Minggu / libur nasional / libur departemen) → kerja dicatat
  // sebagai lembur dan otomatis jadi pengajuan lembur saat check-out.
  const dayOfWeek = wibNow.getUTCDay()
  const holiday = await prisma.holiday.findFirst({ where: { date: today } })
  const deptHoliday = await prisma.departmentHoliday.findFirst({
    where: { departmentId: employee.departmentId ?? undefined, date: today },
  })
  const isOvertimeDay = dayOfWeek === 0 || !!holiday || !!deptHoliday

  // Guard: approved leave check
  const approvedLeave = await prisma.leaveRequest.findFirst({
    where: {
      employeeId,
      status: "approved",
      startDate: { lte: today },
      endDate: { gte: today },
    },
  })
  if (approvedLeave) {
    throw new Error("Anda sedang dalam masa cuti. Tidak dapat check-in.")
  }

  const schedule = await resolveWorkSchedule(employeeId, employee.departmentId, dayOfWeek)
  const startTime = schedule?.startTime ?? "08:00"
  const tolerance = schedule?.lateToleranceMinutes ?? 0
  const nowMinutes = wibNow.getUTCHours() * 60 + wibNow.getUTCMinutes()
  const startMinutes = toMinutes(startTime)
  const deadlineMinutes = startMinutes + tolerance
  const isLate = !isOvertimeDay && nowMinutes > deadlineMinutes
  const lateMinutes = isLate ? nowMinutes - deadlineMinutes : 0

  const attendance = await prisma.attendance.create({
    data: {
      employeeId,
      date: today,
      checkIn: now,
      status: isOvertimeDay ? "overtime" : isLate ? "late" : "present",
      lateMinutes,
      checkInLatitude: latitude ?? null,
      checkInLongitude: longitude ?? null,
    },
  })

  await logActivity("checkin", "Attendance", attendance.id, "Check-in absensi")
  revalidatePath("/sdm/absensi")
  return { success: true, id: attendance.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[checkIn]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function checkOut(employeeId: number, latitude?: number, longitude?: number) {
  try {
  await requirePermission("edit_attendance")

  const now = new Date()
  const wibNow = getWibNow(now)

  // Find the most recent open attendance for this employee regardless of date
  // (handles overnight shifts that cross midnight).
  const attendance = await prisma.attendance.findFirst({
    where: { employeeId, checkOut: null },
    orderBy: { date: "desc" },
  })
  if (!attendance) {
    throw new Error("Belum check-in atau sudah check-out")
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { departmentId: true },
  })
  const dayOfWeek = wibNow.getUTCDay()
  const schedule = await resolveWorkSchedule(employeeId, employee?.departmentId, dayOfWeek)
  const endTime = schedule?.endTime ?? "17:00"
  const endMinutes = toMinutes(endTime)
  const nowMinutes = wibNow.getUTCHours() * 60 + wibNow.getUTCMinutes()
  const isOvertimeDay = attendance.status === "overtime"
  const isHalfDay = !isOvertimeDay && nowMinutes < endMinutes

  // Jam kerja di hari libur → otomatis jadi pengajuan lembur (menunggu persetujuan).
  let overtimeMinutes: number | null = null
  if (isOvertimeDay && attendance.checkIn) {
    const grossMinutes = Math.max(0, Math.round((now.getTime() - attendance.checkIn.getTime()) / 60000))
    // Potong jam istirahat (ISOMA) yang beririsan dengan jam kerja.
    const settings = await getSystemSettings()
    const inWib = getWibNow(attendance.checkIn)
    const inMin = inWib.getUTCHours() * 60 + inWib.getUTCMinutes()
    const overlap = breakOverlapMinutes(inMin, nowMinutes, settings.restBreakStart, settings.restBreakEnd)
    overtimeMinutes = Math.max(0, grossMinutes - overlap)
    const hours = Math.round((overtimeMinutes / 60) * 100) / 100
    if (hours > 0) {
      await prisma.overtimeRequest.create({
        data: {
          employeeId,
          date: attendance.date,
          hours,
          totalHours: hours,
          reason: "Otomatis dari absensi hari libur",
          status: "pending",
        },
      })
    }
  }

  await prisma.attendance.update({
    where: { id: attendance.id },
    data: {
      checkOut: now,
      checkOutLatitude: latitude ?? null,
      checkOutLongitude: longitude ?? null,
      overtimeMinutes: overtimeMinutes ?? attendance.overtimeMinutes,
      status: isHalfDay ? "half_day" : attendance.status,
    },
  })

  await logActivity("checkout", "Attendance", attendance.id, "Check-out absensi")
  revalidatePath("/sdm/absensi")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[checkOut]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function createAttendance(formData: FormData) {
  try {
  await requirePermission("create_attendance")

  const parsed = parseFormData(attendanceSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const attendance = await prisma.attendance.create({
    data: {
      employeeId: v.employeeId,
      date: new Date(v.date),
      checkIn: v.checkIn ? new Date(v.checkIn) : null,
      checkOut: v.checkOut ? new Date(v.checkOut) : null,
      status: v.status,
      checkInLatitude: v.checkInLatitude ?? null,
      checkInLongitude: v.checkInLongitude ?? null,
      checkOutLatitude: v.checkOutLatitude ?? null,
      checkOutLongitude: v.checkOutLongitude ?? null,
      overtimeMinutes: v.overtimeMinutes ?? null,
      overtimeApproved: v.overtimeApproved ?? false,
    },
  })

  await logActivity("create", "Attendance", attendance.id, "Membuat absensi")
  revalidatePath("/sdm/absensi")
  return { success: true, id: attendance.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createAttendance]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateAttendance(id: number, formData: FormData) {
  try {
  await requirePermission("edit_attendance")

  const attendance = await prisma.attendance.update({
    where: { id },
    data: {
      employeeId: requireId(formData.get("employeeId"), "employeeId"),
      date: new Date(formData.get("date") as string),
      checkIn: formData.get("checkIn") ? new Date(formData.get("checkIn") as string) : null,
      checkOut: formData.get("checkOut") ? new Date(formData.get("checkOut") as string) : null,
      status: (formData.get("status") as string) || "present",
      checkInLatitude: safeNumber(formData.get("checkInLatitude")),
      checkInLongitude: safeNumber(formData.get("checkInLongitude")),
      checkOutLatitude: safeNumber(formData.get("checkOutLatitude")),
      checkOutLongitude: safeNumber(formData.get("checkOutLongitude")),
      overtimeMinutes: safeNumber(formData.get("overtimeMinutes")),
      overtimeApproved: formData.get("overtimeApproved") === "true" || formData.get("overtimeApproved") === "on",
    },
  })

  await logActivity("update", "Attendance", attendance.id, "Memperbarui absensi")
  revalidatePath("/sdm/absensi")
  return { success: true, id: attendance.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateAttendance]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== LEAVE REQUEST ACTIONS ====================

export async function createLeaveRequest(formData: FormData) {
  try {
  await requirePermission("create_leave_requests")

  const parsed = parseFormData(leaveRequestSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const employeeId = v.employeeId
  const startDate = new Date(v.startDate)
  const endDate = new Date(v.endDate)

  // Guard: overlap — no pending/approved leave can overlap [startDate, endDate].
  const overlap = await prisma.leaveRequest.findFirst({
    where: {
      employeeId,
      status: { in: ["pending", "approved"] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { id: true },
  })
  if (overlap) {
    throw new Error("Terdapat pengajuan cuti lain yang bentrok di tanggal yang sama. Hapus atau tolak yang lama terlebih dahulu.")
  }

  const leave = await prisma.leaveRequest.create({
    data: {
      employeeId,
      type: v.type,
      startDate,
      endDate,
      reason: v.reason ?? null,
      status: "pending",
    },
  })

  await logActivity("create", "LeaveRequest", leave.id, "Membuat pengajuan cuti")
  revalidatePath("/sdm/cuti")
  return { success: true, id: leave.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createLeaveRequest]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function approveLeave(leaveId: number) {
  try {
  const user = await requirePermission("edit_leave_requests")

  const leave = await prisma.leaveRequest.findUniqueOrThrow({
    where: { id: leaveId },
  })

  if (leave.status !== "pending") {
    throw new Error("Leave request hanya bisa di-approve dari status pending")
  }

  await prisma.leaveRequest.update({
    where: { id: leaveId },
    data: { status: "approved", approvedBy: Number(user.id) },
  })

  await logActivity("approve", "LeaveRequest", leaveId, "Menyetujui pengajuan cuti")
  revalidatePath("/sdm/cuti")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[approveLeave]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function rejectLeave(leaveId: number, reason?: string) {
  try {
  const user = await requirePermission("edit_leave_requests")

  const leave = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: leaveId }, select: { status: true } })
  if (leave.status !== "pending") {
    throw new Error("Hanya pengajuan cuti berstatus menunggu yang dapat ditolak")
  }

  await prisma.leaveRequest.update({
    where: { id: leaveId },
    data: {
      status: "rejected",
      approvedBy: Number(user.id),
      rejectionReason: reason,
    },
  })

  await logActivity("reject", "LeaveRequest", leaveId, "Menolak pengajuan cuti")
  revalidatePath("/sdm/cuti")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[rejectLeave]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== OVERTIME REQUEST ACTIONS ====================

export async function createOvertimeRequest(formData: FormData) {
  try {
  await requirePermission("create_overtime_requests")

  const parsed = parseFormData(overtimeRequestSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const overtime = await prisma.overtimeRequest.create({
    data: {
      employeeId: v.employeeId,
      projectId: v.projectId ?? null,
      date: new Date(v.date),
      hours: v.hours,
      totalHours: v.totalHours ?? null,
      mealHours: v.mealHours ?? null,
      billableHours: v.billableHours ?? null,
      reason: v.reason ?? null,
      status: "pending",
    },
  })

  await logActivity("create", "OvertimeRequest", overtime.id, "Membuat pengajuan lembur")
  revalidatePath("/sdm/lembur")
  return { success: true, id: overtime.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createOvertimeRequest]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function approveOvertime(overtimeId: number) {
  try {
  const user = await requirePermission("edit_overtime_requests")

  const ot = await prisma.overtimeRequest.findUniqueOrThrow({
    where: { id: overtimeId },
    include: { employee: { select: { baseSalary: true } } },
  })
  if (ot.status !== "pending") {
    throw new Error("Hanya pengajuan lembur berstatus menunggu yang dapat disetujui")
  }

  // Compute overtime value: hours * baseSalary * multiplier * coefficient.
  // Default: multiplier ≈ 1/173 (monthly-to-hourly), coefficient 1.10 (first-hour rate).
  const settings = await prisma.systemSetting.findFirst({
    select: { overtimeMultiplier: true, overtimeCoefficient: true },
  })
  const multiplier = Number(settings?.overtimeMultiplier ?? 0.00578035)
  const coefficient = Number(settings?.overtimeCoefficient ?? 1.10)
  const baseSalary = Number(ot.employee?.baseSalary ?? 0)
  const hours = Number(ot.hours)
  const calculatedValue = Math.round(hours * baseSalary * multiplier * coefficient)

  await prisma.overtimeRequest.update({
    where: { id: overtimeId },
    data: { status: "approved", approvedBy: Number(user.id), calculatedValue },
  })

  await logActivity("approve", "OvertimeRequest", overtimeId, "Menyetujui pengajuan lembur")
  revalidatePath("/sdm/lembur")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[approveOvertime]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== PAYROLL ACTIONS ====================

export async function getPayrollEstimation(employeeId: number, startDateStr: string, endDateStr: string) {
  try {
  await requirePermission("view_payroll")
  const startDate = new Date(startDateStr)
  const endDate = new Date(endDateStr)

  // 1. Base Salary & Active Loans
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      baseSalary: true,
      maritalStatus: true,
      employeeLoans: {
        where: { status: "active" }
      }
    }
  })
  
  if (!employee) throw new Error("Employee not found")

  const baseSalary = Number(employee.baseSalary)
  // Loan deduction capped to what each loan actually still owes (remaining), so the
  // final-installment scenario doesn't over-deduct the employee.
  const loanDeduction = employee.employeeLoans.reduce(
    (sum, loan) => sum + Math.min(Number(loan.monthlyInstallment), Number(loan.remainingAmount)),
    0
  )

  // 2. Overtime Total
  const overtimes = await prisma.overtimeRequest.findMany({
    where: {
      employeeId,
      status: "approved",
      date: { gte: startDate, lte: endDate }
    }
  })
  const overtimeTotal = overtimes.reduce((sum, ot) => sum + Number(ot.calculatedValue ?? 0), 0)

  // 3. Appreciation Total
  const appreciations = await prisma.appreciation.findMany({
    where: {
      employeeId,
      date: { gte: startDate, lte: endDate }
    }
  })
  const appreciationTotal = appreciations.reduce((sum, ap) => sum + Number(ap.amount ?? 0), 0)

  // 4. Late Deduction
  const latePenalty = await calculateLatePenalty(employeeId, startDate, endDate)

  // 5. Attendance summary (working days, absent/bolos deduction, holidays excluded)
  const attendance = await calculateAttendanceSummary(employeeId, startDate, endDate)

  // 6. Statutory: BPJS (employee portion) + PPh21
  const grossSalary = baseSalary + overtimeTotal + appreciationTotal
  const bpjs = computeBpjsEmployee(baseSalary)
  const pph21 = computePph21Monthly(grossSalary, employee.maritalStatus, bpjs.total)

  return {
    baseSalary,
    overtimeTotal,
    appreciationTotal,
    loanDeduction,
    lateDeduction: latePenalty.totalPenalty,
    lateMinutes: latePenalty.totalLateMinutes,
    workingDays: attendance.workingDays,
    presentDays: attendance.presentDays,
    leaveDays: attendance.leaveDays,
    holidayDays: attendance.holidayDays,
    absentDays: attendance.absentDays,
    dailyRate: attendance.dailyRate,
    absentDeduction: attendance.absentDeduction,
    grossSalary,
    bpjsHealthEmployee: bpjs.health,
    bpjsEmploymentEmployee: bpjs.employment,
    pph21,
  }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[getPayrollEstimation]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function generateBulkPayroll(period: string, startDateStr: string, endDateStr: string) {
  try {
  const user = await requirePermission("create_payroll")
  
  const employees = await prisma.employee.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true },
  })

  // Batch: fetch all existing payrolls for this period in one query (eliminates N+1)
  const existingPayrolls = await prisma.payroll.findMany({
    where: { period, employeeId: { in: employees.map(e => e.id) } },
    select: { employeeId: true },
  })
  const existingSet = new Set(existingPayrolls.map(p => p.employeeId))

  let count = 0
  for (const emp of employees) {
    if (existingSet.has(emp.id)) continue

    {
      const est = await getPayrollEstimation(emp.id, startDateStr, endDateStr)
      if (!est || 'success' in est) { continue } // skip failed estimation
      const documentNo = await generateDocumentNumber("PAYROLL")
      
      const statutory = (est.bpjsHealthEmployee ?? 0) + (est.bpjsEmploymentEmployee ?? 0) + (est.pph21 ?? 0)
      // Allowances/deductions are manual per-payslip fields (not part of auto-estimation);
      // they default to 0 and can be edited before approval. Formula mirrors processPayroll.
      const allowances = 0
      const deductions = 0
      const netSalary = (est.baseSalary ?? 0) + allowances + (est.overtimeTotal ?? 0) + (est.appreciationTotal ?? 0) - deductions - (est.loanDeduction ?? 0) - (est.lateDeduction ?? 0) - (est.absentDeduction ?? 0) - statutory
      
      await prisma.payroll.create({
        data: {
          documentNo,
          employeeId: emp.id,
          period,
          startDate: new Date(startDateStr),
          endDate: new Date(endDateStr),
          baseSalary: est.baseSalary ?? 0,
          allowances,
          deductions,
          overtimeTotal: est.overtimeTotal ?? 0,
          appreciationTotal: est.appreciationTotal ?? 0,
          loanDeduction: est.loanDeduction ?? 0,
          lateDeduction: est.lateDeduction,
          lateMinutes: est.lateMinutes,
          workingDays: est.workingDays ?? 0,
          presentDays: est.presentDays ?? 0,
          absentDays: est.absentDays ?? 0,
          absentDeduction: est.absentDeduction ?? 0,
          grossSalary: est.grossSalary ?? 0,
          bpjsHealthEmployee: est.bpjsHealthEmployee ?? 0,
          bpjsEmploymentEmployee: est.bpjsEmploymentEmployee ?? 0,
          pph21: est.pph21 ?? 0,
          netSalary: netSalary,
          totalAmount: netSalary,
          status: "draft",
          createdBy: Number(user.id),
        }
      })
      count++
    }
  }

  await logActivity("generate", "Payroll", 0, `Generate massal penggajian periode ${period} (${count} karyawan)`)
  revalidatePath("/sdm/penggajian")
  return { success: true, count }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[generateBulkPayroll]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function processPayroll(formData: FormData) {
  try {
  const user = await requirePermission("create_payroll")

  const documentNo = await generateDocumentNumber("PAYROLL")
  const employeeId = safeId(formData.get("employeeId"))
  const period = formData.get("period") as string
  const startDate = new Date(formData.get("startDate") as string)
  const endDate = new Date(formData.get("endDate") as string)

  // Idempotency: prevent duplicate payroll for same employee+period.
  if (employeeId && period) {
    const exists = await prisma.payroll.findFirst({
      where: { employeeId, period },
      select: { id: true },
    })
    if (exists) {
      throw new Error(`Penggajian untuk karyawan ini pada periode ${period} sudah ada.`)
    }
  }

  // Auto-calculate late penalty
  let lateDeduction = safeNumber(formData.get("lateDeduction")) ?? 0
  let lateMinutes = safeNumber(formData.get("lateMinutes")) ?? 0

  if (employeeId && lateDeduction === 0) {
    const latePenalty = await calculateLatePenalty(employeeId, startDate, endDate)
    lateDeduction = latePenalty.totalPenalty
    lateMinutes = latePenalty.totalLateMinutes
  }

  // Attendance summary (working days + bolos deduction; holidays excluded)
  let workingDays = safeNumber(formData.get("workingDays")) ?? 0
  let presentDays = safeNumber(formData.get("presentDays")) ?? 0
  let absentDays = safeNumber(formData.get("absentDays")) ?? 0
  let absentDeduction = safeNumber(formData.get("absentDeduction")) ?? 0
  if (employeeId && absentDeduction === 0 && workingDays === 0) {
    const att = await calculateAttendanceSummary(employeeId, startDate, endDate)
    workingDays = att.workingDays
    presentDays = att.presentDays
    absentDays = att.absentDays
    absentDeduction = att.absentDeduction
  }

  const baseSalary = safeNumber(formData.get("baseSalary")) ?? 0
  const allowances = safeNumber(formData.get("allowances")) ?? 0
  const deductions = safeNumber(formData.get("deductions")) ?? 0
  const overtimeTotal = safeNumber(formData.get("overtimeTotal")) ?? 0
  const appreciationTotal = safeNumber(formData.get("appreciationTotal")) ?? 0
  const loanDeduction = safeNumber(formData.get("loanDeduction")) ?? 0

  // Statutory: BPJS (employee) + PPh21, computed server-side from base salary.
  const empForTax = employeeId ? await prisma.employee.findUnique({ where: { id: employeeId }, select: { maritalStatus: true } }) : null
  const grossSalary = baseSalary + allowances + overtimeTotal + appreciationTotal
  const bpjs = computeBpjsEmployee(baseSalary)
  const pph21 = computePph21Monthly(grossSalary, empForTax?.maritalStatus, bpjs.total)
  const statutory = bpjs.total + pph21

  const netSalary = baseSalary + allowances + overtimeTotal + appreciationTotal - deductions - loanDeduction - lateDeduction - absentDeduction - statutory
  // totalAmount must mirror the server-computed netSalary — never trust a
  // client-supplied total. Accepting formData "totalAmount" let the stored
  // figure (shown on payslips/reports/list-totals) diverge from the actual net
  // pay and from the GL posting, which posts netSalary + statutory (see
  // postPayrollJournal in accounting.hook.ts).
  const totalAmount = netSalary
  const paymentDateRaw = formData.get("paymentDate") as string | null

  const payroll = await prisma.payroll.create({
    data: {
      documentNo,
      employeeId,
      period,
      startDate,
      endDate,
      baseSalary,
      allowances,
      deductions,
      overtimeTotal,
      appreciationTotal,
      loanDeduction,
      lateDeduction,
      lateMinutes,
      workingDays,
      presentDays,
      absentDays,
      absentDeduction,
      grossSalary,
      bpjsHealthEmployee: bpjs.health,
      bpjsEmploymentEmployee: bpjs.employment,
      pph21,
      netSalary,
      totalAmount,
      paymentDate: paymentDateRaw ? new Date(paymentDateRaw) : null,
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  await logActivity("process", "Payroll", payroll.id, "Memproses penggajian")
  revalidatePath("/sdm/penggajian")
  return { success: true, id: payroll.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[processPayroll]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updatePayroll(id: number, formData: FormData) {
  try {
  await requirePermission("edit_payroll")

  // Only draft payroll can be edited
  const existing = await prisma.payroll.findUniqueOrThrow({ where: { id } })
  if (existing.status !== "draft") {
    throw new Error("Hanya penggajian status draft yang dapat diubah")
  }

  const employeeId = safeId(formData.get("employeeId"))
  const startDate = new Date(formData.get("startDate") as string)
  const endDate = new Date(formData.get("endDate") as string)

  // Auto-calculate late penalty if not manually provided
  let lateDeduction = safeNumber(formData.get("lateDeduction")) ?? 0
  let lateMinutes = safeNumber(formData.get("lateMinutes")) ?? 0

  const recalcLate = formData.get("recalcLate") === "true"
  if (employeeId && (lateDeduction === 0 || recalcLate)) {
    const latePenalty = await calculateLatePenalty(employeeId, startDate, endDate)
    lateDeduction = latePenalty.totalPenalty
    lateMinutes = latePenalty.totalLateMinutes
  }

  // Attendance summary (working days + bolos deduction; holidays excluded)
  let workingDays = safeNumber(formData.get("workingDays")) ?? 0
  let presentDays = safeNumber(formData.get("presentDays")) ?? 0
  let absentDays = safeNumber(formData.get("absentDays")) ?? 0
  let absentDeduction = safeNumber(formData.get("absentDeduction")) ?? 0
  if (employeeId && (recalcLate || (absentDeduction === 0 && workingDays === 0))) {
    const att = await calculateAttendanceSummary(employeeId, startDate, endDate)
    workingDays = att.workingDays
    presentDays = att.presentDays
    absentDays = att.absentDays
    absentDeduction = att.absentDeduction
  }

  const baseSalary = safeNumber(formData.get("baseSalary")) ?? 0
  const allowances = safeNumber(formData.get("allowances")) ?? 0
  const deductions = safeNumber(formData.get("deductions")) ?? 0
  const overtimeTotal = safeNumber(formData.get("overtimeTotal")) ?? 0
  const appreciationTotal = safeNumber(formData.get("appreciationTotal")) ?? 0
  const loanDeduction = safeNumber(formData.get("loanDeduction")) ?? 0

  // Statutory: BPJS (employee) + PPh21, computed server-side.
  const empForTaxUpd = employeeId ? await prisma.employee.findUnique({ where: { id: employeeId }, select: { maritalStatus: true } }) : null
  const grossSalary = baseSalary + allowances + overtimeTotal + appreciationTotal
  const bpjs = computeBpjsEmployee(baseSalary)
  const pph21 = computePph21Monthly(grossSalary, empForTaxUpd?.maritalStatus, bpjs.total)
  const statutory = bpjs.total + pph21

  // Recalculate net_salary auto
  const netSalary = baseSalary + allowances + overtimeTotal + appreciationTotal - deductions - loanDeduction - lateDeduction - absentDeduction - statutory
  // totalAmount must mirror the server-computed netSalary — never trust a
  // client-supplied total. Accepting formData "totalAmount" let the stored
  // figure (shown on payslips/reports/list-totals) diverge from the actual net
  // pay and from the GL posting, which posts netSalary + statutory (see
  // postPayrollJournal in accounting.hook.ts).
  const totalAmount = netSalary
  const paymentDateRaw = formData.get("paymentDate") as string | null

  const payroll = await prisma.payroll.update({
    where: { id },
    data: {
      employeeId,
      period: formData.get("period") as string,
      startDate,
      endDate,
      baseSalary,
      allowances,
      deductions,
      overtimeTotal,
      appreciationTotal,
      loanDeduction,
      lateDeduction,
      lateMinutes,
      workingDays,
      presentDays,
      absentDays,
      absentDeduction,
      grossSalary,
      bpjsHealthEmployee: bpjs.health,
      bpjsEmploymentEmployee: bpjs.employment,
      pph21,
      netSalary,
      totalAmount,
      paymentDate: paymentDateRaw ? new Date(paymentDateRaw) : null,
    },
  })

  await logActivity("update", "Payroll", payroll.id, "Memperbarui penggajian")
  revalidatePath("/sdm/penggajian")
  return { success: true, id: payroll.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updatePayroll]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function approvePayroll(payrollId: number) {
  try {
  const user = await requirePermission("edit_payroll")

  const payroll = await prisma.payroll.findUniqueOrThrow({
    where: { id: payrollId },
  })

  if (payroll.status !== "draft") {
    throw new Error("Payroll hanya bisa di-approve dari status draft")
  }

  await prisma.payroll.update({
    where: { id: payrollId },
    data: { status: "approved", approvedBy: Number(user.id) },
  })

  await logActivity("approve", "Payroll", payrollId, "Menyetujui penggajian")
  revalidatePath("/sdm/penggajian")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[approvePayroll]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function markPayrollPaid(payrollId: number) {
  try {
  await requirePermission("edit_payroll")

  const payroll = await prisma.payroll.findUniqueOrThrow({
    where: { id: payrollId },
  })

  if (payroll.status !== "approved") {
    throw new Error("Payroll hanya bisa ditandai dibayar dari status approved")
  }

  await prisma.$transaction(async (tx) => {
    await tx.payroll.update({
      where: { id: payrollId },
      data: { status: "paid", paymentDate: new Date() },
    })

    // Amortize active employee loans using the amount actually withheld this
    // payroll (payroll.loanDeduction). Distribute oldest-first, capping each loan
    // by its installment and remaining balance, and stop once the withheld budget
    // is exhausted — previously every active loan was reduced by its full
    // installment regardless of how much was actually deducted (over-amortization).
    if (payroll.employeeId && Number(payroll.loanDeduction) > 0) {
      const activeLoans = await tx.employeeLoan.findMany({
        where: { employeeId: payroll.employeeId, status: "active" },
        orderBy: { loanDate: "asc" },
      })
      let budget = Number(payroll.loanDeduction)
      for (const loan of activeLoans) {
        if (budget <= 0) break
        const installment = Number(loan.monthlyInstallment)
        const remaining = Number(loan.remainingAmount)
        if (remaining <= 0) continue
        const applied = Math.min(installment, remaining, budget)
        if (applied <= 0) continue
        const newRemaining = remaining - applied
        budget -= applied
        await tx.employeeLoan.update({
          where: { id: loan.id },
          data: {
            remainingAmount: newRemaining,
            status: newRemaining <= 0 ? "paid_off" : "active",
          },
        })
      }
    }
  })

  // Post journal entry for salary expense
  await onPayrollPaid(payrollId)

  await logActivity("mark", "Payroll", payrollId, "Menandai penggajian sebagai dibayar")
  revalidatePath("/sdm/penggajian")
  revalidatePath(`/sdm/penggajian/${payrollId}`)
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[markPayrollPaid]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== EMPLOYEE LOAN ACTIONS ====================

export async function createEmployeeLoan(formData: FormData) {
  try {
  await requirePermission("create_loans")

  const parsed = parseFormData(employeeLoanSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const totalAmount = v.totalAmount

  const loan = await prisma.employeeLoan.create({
    data: {
      employeeId: v.employeeId,
      loanDate: new Date(v.loanDate),
      totalAmount,
      monthlyInstallment: v.monthlyInstallment,
      remainingAmount: totalAmount,
      status: "active",
      notes: v.notes ?? null,
    },
  })

  await logActivity("create", "EmployeeLoan", loan.id, "Membuat pinjaman karyawan")
  revalidatePath("/sdm/pinjaman")
  return { success: true, id: loan.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createEmployeeLoan]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== TIMESHEET ACTIONS ====================

export async function createTimesheet(formData: FormData) {
  try {
  await requirePermission("create_timesheets")

  const parsed = parseFormData(timesheetSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const timesheet = await prisma.timesheet.create({
    data: {
      employeeId: v.employeeId,
      projectId: v.projectId,
      taskId: v.taskId ?? null,
      date: new Date(v.date),
      startTime: v.startTime ?? null,
      endTime: v.endTime ?? null,
      hours: v.hours,
      description: v.description ?? null,
    },
  })

  await logActivity("create", "Timesheet", timesheet.id, "Membuat lembar waktu")
  revalidatePath("/sdm/lembar-waktu")
  return { success: true, id: timesheet.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createTimesheet]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== WORK SCHEDULE ACTIONS ====================

export async function createWorkSchedule(formData: FormData) {
  try {
  await requirePermission("create_work_schedules")

  const parsed = parseFormData(workScheduleSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const name = v.name
  const days = formData.getAll("days") as string[]
  const startTime = v.startTime
  const endTime = v.endTime
  const departmentIds = (formData.getAll("departmentId") as string[])
    .map((d) => safeNumber(d))
    .filter((n): n is number => n != null)
  const employeeIds = (formData.getAll("employeeId") as string[])
    .map((d) => safeNumber(d))
    .filter((n): n is number => n != null)
  const lateToleranceMinutes = v.lateToleranceMinutes ?? 0
  const isActive = v.isActive ?? false

  await prisma.workSchedule.create({
    data: {
      name,
      workDays: days.join(","),
      startTime,
      endTime,
      lateToleranceMinutes,
      isActive,
      departments: departmentIds.length > 0 ? { connect: departmentIds.map((id) => ({ id })) } : undefined,
      employees: employeeIds.length > 0 ? { connect: employeeIds.map((id) => ({ id })) } : undefined,
    },
  })

  await logActivity("create", "WorkSchedule", 0, "Membuat jadwal kerja")
  revalidatePath("/sdm/jadwal-kerja")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createWorkSchedule]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== HOLIDAY ACTIONS ====================

export async function createHoliday(formData: FormData) {
  try {
  await requirePermission("create_holidays")

  const parsed = parseFormData(holidaySchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const holiday = await prisma.holiday.create({
    data: {
      name: v.name,
      date: new Date(v.date),
      description: v.description ?? null,
    },
  })

  await logActivity("create", "Holiday", holiday.id, "Membuat hari libur")
  revalidatePath("/sdm/hari-libur")
  return { success: true, id: holiday.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createHoliday]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateHoliday(id: number, formData: FormData) {
  try {
  await requirePermission("create_holidays")

  await prisma.holiday.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      date: new Date(formData.get("date") as string),
      description: formData.get("description") as string | null,
    },
  })

  await logActivity("update", "Holiday", id, "Memperbarui hari libur")
  revalidatePath("/sdm/hari-libur")
  return { success: true, id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateHoliday]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== DELETE ACTIONS ====================

export async function deleteLeaveRequest(id: number) {
  try {
  await requirePermission("delete_leave_requests")

  await prisma.leaveRequest.delete({ where: { id } })

  await logActivity("delete", "LeaveRequest", id, "Menghapus pengajuan cuti")
  revalidatePath("/sdm/cuti")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteLeaveRequest]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteOvertimeRequest(id: number) {
  try {
  await requirePermission("delete_overtime_requests")

  await prisma.overtimeRequest.delete({ where: { id } })

  await logActivity("delete", "OvertimeRequest", id, "Menghapus pengajuan lembur")
  revalidatePath("/sdm/lembur")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteOvertimeRequest]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteTimesheet(id: number) {
  try {
  await requirePermission("delete_timesheets")

  await prisma.timesheet.delete({ where: { id } })

  await logActivity("delete", "Timesheet", id, "Menghapus lembar waktu")
  revalidatePath("/sdm/lembar-waktu")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteTimesheet]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteEmployeeLoan(id: number) {
  try {
  await requirePermission("delete_loans")

  await prisma.employeeLoan.delete({ where: { id } })

  await logActivity("delete", "EmployeeLoan", id, "Menghapus pinjaman karyawan")
  revalidatePath("/sdm/pinjaman")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteEmployeeLoan]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteWorkSchedule(id: number) {
  try {
  await requirePermission("delete_work_schedules")

  await prisma.workSchedule.delete({ where: { id } })

  await logActivity("delete", "WorkSchedule", id, "Menghapus jadwal kerja")
  revalidatePath("/sdm/jadwal-kerja")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteWorkSchedule]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteHoliday(id: number) {
  try {
  await requirePermission("delete_holidays")

  await prisma.holiday.delete({ where: { id } })

  await logActivity("delete", "Holiday", id, "Menghapus hari libur")
  revalidatePath("/sdm/hari-libur")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteHoliday]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/**
 * Sync Indonesian national holidays for a given year from a public calendar API.
 * Idempotent — safe to run repeatedly.
 */
export async function syncNationalHolidays(year?: number) {
  try {
    await requirePermission("create_holidays")
    const targetYear = year && year > 2000 ? year : new Date().getFullYear()
    const result = await syncNationalHolidaysService(targetYear)
    await logActivity("sync", "Holiday", 0, `Sinkronisasi libur nasional tahun ${targetYear}`)
    revalidatePath("/sdm/hari-libur")
    return { success: true, ...result }
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[syncNationalHolidays]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Gagal sinkronisasi libur nasional") }
  }
}


export async function updateLeaveRequest(id: number, formData: FormData) {
  "use server"

  try {

  await requirePermission("create_leave_requests")

  // Only pending requests can be edited. Approved/rejected leave must not be re-opened.
  const existing = await prisma.leaveRequest.findUniqueOrThrow({ where: { id }, select: { status: true } })
  if (existing.status !== "pending") {
    throw new Error("Hanya pengajuan cuti berstatus menunggu yang dapat diedit")
  }

  const leave = await prisma.leaveRequest.update({
    where: { id },
    data: {
      employeeId: requireId(formData.get("employeeId"), "employeeId"),
      type: formData.get("type") as string,
      startDate: new Date(formData.get("startDate") as string),
      endDate: new Date(formData.get("endDate") as string),
      reason: formData.get("reason") as string | null,
    },
  })

  await logActivity("update", "LeaveRequest", leave.id, "Memperbarui pengajuan cuti")
  revalidatePath("/sdm/cuti")
  return { success: true, id: leave.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateLeaveRequest]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateOvertimeRequest(id: number, formData: FormData) {
  "use server"

  try {

  await requirePermission("create_overtime_requests")

  const overtime = await prisma.overtimeRequest.update({
    where: { id },
    data: {
      employeeId: requireId(formData.get("employeeId"), "employeeId"),
      projectId: safeNumber(formData.get("projectId")),
      date: new Date(formData.get("date") as string),
      hours: requireNumber(formData.get("hours"), "hours"),
      totalHours: safeNumber(formData.get("totalHours")),
      mealHours: safeNumber(formData.get("mealHours")),
      billableHours: safeNumber(formData.get("billableHours")),
      reason: formData.get("reason") as string | null,
      status: "pending",
    },
  })

  await logActivity("update", "OvertimeRequest", overtime.id, "Memperbarui pengajuan lembur")
  revalidatePath("/sdm/lembur")
  return { success: true, id: overtime.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateOvertimeRequest]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateEmployeeLoan(id: number, formData: FormData) {
  "use server"

  try {

  await requirePermission("create_loans")

  const totalAmount = requireNumber(formData.get("totalAmount"), "totalAmount")

  // Only adjust remainingAmount if totalAmount was actually changed. This prevents
  // wiping amortization progress when editing other fields (notes, installment).
  // Status is NOT accepted from client — it's managed only by markPayrollPaid.
  const existing = await prisma.employeeLoan.findUniqueOrThrow({ where: { id }, select: { totalAmount: true, remainingAmount: true, status: true } })
  const oldTotal = Number(existing.totalAmount)
  const oldRemaining = Number(existing.remainingAmount)
  const delta = totalAmount - oldTotal
  // If totalAmount changed, shift remaining by the same delta (can't go below 0).
  const newRemaining = delta !== 0 ? Math.max(0, oldRemaining + delta) : oldRemaining

  const loan = await prisma.employeeLoan.update({
    where: { id },
    data: {
      employeeId: requireId(formData.get("employeeId"), "employeeId"),
      loanDate: new Date(formData.get("loanDate") as string),
      totalAmount,
      monthlyInstallment: requireNumber(formData.get("monthlyInstallment"), "monthlyInstallment"),
      remainingAmount: newRemaining,
      // Status stays unchanged (managed by markPayrollPaid / system only).
      notes: formData.get("notes") as string | null,
    },
  })

  await logActivity("update", "EmployeeLoan", loan.id, "Memperbarui pinjaman karyawan")
  revalidatePath("/sdm/pinjaman")
  return { success: true, id: loan.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateEmployeeLoan]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateTimesheet(id: number, formData: FormData) {
  "use server"

  try {

  await requirePermission("create_timesheets")

  const timesheet = await prisma.timesheet.update({
    where: { id },
    data: {
      employeeId: requireId(formData.get("employeeId"), "employeeId"),
      projectId: requireId(formData.get("projectId"), "projectId"),
      taskId: safeNumber(formData.get("taskId")),
      date: new Date(formData.get("date") as string),
      startTime: formData.get("startTime") as string | null,
      endTime: formData.get("endTime") as string | null,
      hours: requireNumber(formData.get("hours"), "hours"),
      description: formData.get("description") as string | null,
    },
  })

  await logActivity("update", "Timesheet", timesheet.id, "Memperbarui lembar waktu")
  revalidatePath("/sdm/lembar-waktu")
  return { success: true, id: timesheet.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateTimesheet]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateWorkSchedule(id: number, formData: FormData) {
  "use server"

  try {

  await requirePermission("create_work_schedules")

  const name = formData.get("name") as string
  const days = formData.getAll("days") as string[]
  const startTime = formData.get("startTime") as string
  const endTime = formData.get("endTime") as string
  const departmentIds = (formData.getAll("departmentId") as string[])
    .map((d) => safeNumber(d))
    .filter((n): n is number => n != null)
  const employeeIds = (formData.getAll("employeeId") as string[])
    .map((d) => safeNumber(d))
    .filter((n): n is number => n != null)
  const lateToleranceMinutes = safeNumber(formData.get("lateToleranceMinutes")) ?? 0
  const isActive = formData.get("isActive") === "true"

  await prisma.workSchedule.update({
    where: { id },
    data: {
      name,
      workDays: days.join(","),
      startTime,
      endTime,
      lateToleranceMinutes,
      isActive,
      departments: { set: departmentIds.map((did) => ({ id: did })) },
      employees: { set: employeeIds.map((eid) => ({ id: eid })) },
    },
  })

  await logActivity("update", "WorkSchedule", id, "Memperbarui jadwal kerja")
  revalidatePath("/sdm/jadwal-kerja")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateWorkSchedule]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== DEPARTMENT HOLIDAY ACTIONS ====================

export async function createDepartmentHoliday(formData: FormData) {
  try {
  await requirePermission("create_holidays")

  const parsed = parseFormData(departmentHolidaySchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const holiday = await prisma.departmentHoliday.create({
    data: {
      departmentId: v.departmentId,
      name: v.name,
      date: new Date(v.date),
      isRecurring: v.isRecurring ?? false,
    },
  })

  await logActivity("create", "DepartmentHoliday", holiday.id, "Membuat hari libur departemen")
  revalidatePath("/sdm/hari-libur-departemen")
  return { success: true, id: holiday.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createDepartmentHoliday]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateDepartmentHoliday(formData: FormData) {
  try {
  await requirePermission("create_holidays")

  const id = requireId(formData.get("id"), "id")

  const holiday = await prisma.departmentHoliday.update({
    where: { id },
    data: {
      departmentId: requireId(formData.get("departmentId"), "departmentId"),
      name: formData.get("name") as string,
      date: new Date(formData.get("date") as string),
      isRecurring: formData.get("isRecurring") === "on" || formData.get("isRecurring") === "true",
    },
  })

  await logActivity("update", "DepartmentHoliday", holiday.id, "Memperbarui hari libur departemen")
  revalidatePath("/sdm/hari-libur-departemen")
  return { success: true, id: holiday.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateDepartmentHoliday]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteDepartmentHoliday(id: number) {
  try {
  await requirePermission("delete_holidays")

  await prisma.departmentHoliday.delete({ where: { id } })

  await logActivity("delete", "DepartmentHoliday", id, "Menghapus hari libur departemen")
  revalidatePath("/sdm/hari-libur-departemen")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteDepartmentHoliday]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== APPRECIATION ACTIONS ====================

export async function createAppreciation(formData: FormData) {
  try {
  await requirePermission("create_appreciations")

  const parsed = parseFormData(appreciationSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const appreciation = await prisma.appreciation.create({
    data: {
      employeeId: v.employeeId,
      date: new Date(v.date),
      type: v.type,
      amount: v.amount ?? 0,
      notes: v.notes ?? null,
    },
  })

  await logActivity("create", "Appreciation", appreciation.id, "Membuat apresiasi")
  revalidatePath("/sdm/apresiasi")
  return { success: true, id: appreciation.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createAppreciation]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateAppreciation(formData: FormData) {
  try {
  await requirePermission("create_appreciations")

  const id = requireId(formData.get("id"), "id")

  const appreciation = await prisma.appreciation.update({
    where: { id },
    data: {
      employeeId: requireId(formData.get("employeeId"), "employeeId"),
      date: new Date(formData.get("date") as string),
      type: (formData.get("type") as string) || "bonus",
      amount: safeNumber(formData.get("amount")) ?? 0,
      notes: formData.get("notes") as string | null,
    },
  })

  await logActivity("update", "Appreciation", appreciation.id, "Memperbarui apresiasi")
  revalidatePath("/sdm/apresiasi")
  return { success: true, id: appreciation.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateAppreciation]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteAppreciation(id: number) {
  try {
  await requirePermission("delete_appreciations")

  await prisma.appreciation.delete({ where: { id } })

  await logActivity("delete", "Appreciation", id, "Menghapus apresiasi")
  revalidatePath("/sdm/apresiasi")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteAppreciation]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
