"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { revalidatePath } from "next/cache"
import { requireId, safeId, requireNumber, safeNumber } from "@/lib/utils/safe-parse"
import { calculateLatePenalty } from "@/lib/services/late-penalty.service"

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

async function resolveWorkSchedule(departmentId: number | null | undefined, dayOfWeek: number) {
  const schedules = await prisma.workSchedule.findMany({
    where: {
      isActive: true,
      dayOfWeek,
      OR: [{ departmentId: departmentId ?? undefined }, { departmentId: null }],
    },
    orderBy: { departmentId: "desc" },
  })

  return (
    schedules.find((s) => s.departmentId === (departmentId ?? null)) ??
    schedules.find((s) => s.departmentId === null) ??
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

  // Guard: holiday check (global + department)
  const dayOfWeek = wibNow.getUTCDay()
  const holiday = await prisma.holiday.findFirst({ where: { date: today } })
  const deptHoliday = await prisma.departmentHoliday.findFirst({
    where: { departmentId: employee.departmentId ?? undefined, date: today },
  })
  if (holiday || deptHoliday) {
    throw new Error("Hari ini adalah hari libur. Tidak dapat check-in.")
  }

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

  const schedule = await resolveWorkSchedule(employee.departmentId, dayOfWeek)
  const startTime = schedule?.startTime ?? "08:00"
  const tolerance = schedule?.lateToleranceMinutes ?? 0
  const nowMinutes = wibNow.getUTCHours() * 60 + wibNow.getUTCMinutes()
  const startMinutes = toMinutes(startTime)
  const deadlineMinutes = startMinutes + tolerance
  const isLate = nowMinutes > deadlineMinutes
  const lateMinutes = isLate ? nowMinutes - startMinutes : 0

  const attendance = await prisma.attendance.create({
    data: {
      employeeId,
      date: today,
      checkIn: now,
      status: isLate ? "late" : "present",
      lateMinutes,
      checkInLatitude: latitude ?? null,
      checkInLongitude: longitude ?? null,
    },
  })

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
  const today = getWibDateOnly(now)

  const attendance = await prisma.attendance.findFirst({
    where: { employeeId, date: today, checkOut: null },
  })
  if (!attendance) {
    throw new Error("Belum check-in atau sudah check-out hari ini")
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { departmentId: true },
  })
  const dayOfWeek = wibNow.getUTCDay()
  const schedule = await resolveWorkSchedule(employee?.departmentId, dayOfWeek)
  const endTime = schedule?.endTime ?? "17:00"
  const endMinutes = toMinutes(endTime)
  const nowMinutes = wibNow.getUTCHours() * 60 + wibNow.getUTCMinutes()
  const isHalfDay = nowMinutes < endMinutes

  await prisma.attendance.update({
    where: { id: attendance.id },
    data: {
      checkOut: now,
      checkOutLatitude: latitude ?? null,
      checkOutLongitude: longitude ?? null,
      status: isHalfDay ? "half_day" : attendance.status,
    },
  })

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

  const attendance = await prisma.attendance.create({
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

  const leave = await prisma.leaveRequest.create({
    data: {
      employeeId: requireId(formData.get("employeeId"), "employeeId"),
      type: formData.get("type") as string,
      startDate: new Date(formData.get("startDate") as string),
      endDate: new Date(formData.get("endDate") as string),
      reason: formData.get("reason") as string | null,
      status: "pending",
    },
  })

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

  await prisma.leaveRequest.update({
    where: { id: leaveId },
    data: {
      status: "rejected",
      approvedBy: Number(user.id),
      rejectionReason: reason,
    },
  })

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

  const overtime = await prisma.overtimeRequest.create({
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

  await prisma.overtimeRequest.update({
    where: { id: overtimeId },
    data: { status: "approved", approvedBy: Number(user.id) },
  })

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
  const startDate = new Date(startDateStr)
  const endDate = new Date(endDateStr)

  // 1. Base Salary & Active Loans
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      baseSalary: true,
      employeeLoans: {
        where: { status: "active" }
      }
    }
  })
  
  if (!employee) throw new Error("Employee not found")

  const baseSalary = Number(employee.baseSalary)
  const loanDeduction = employee.employeeLoans.reduce((sum, loan) => sum + Number(loan.monthlyInstallment), 0)

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

  return {
    baseSalary,
    overtimeTotal,
    appreciationTotal,
    loanDeduction,
    lateDeduction: latePenalty.totalPenalty,
    lateMinutes: latePenalty.totalLateMinutes,
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
    where: { isActive: true, deletedAt: null }
  })

  let count = 0
  for (const emp of employees) {
    // Check if payroll exists for this period
    const exists = await prisma.payroll.findFirst({
      where: { employeeId: emp.id, period }
    })

    if (!exists) {
      const est = await getPayrollEstimation(emp.id, startDateStr, endDateStr)
      if (!est || 'success' in est) { continue } // skip failed estimation
      const documentNo = await generateDocumentNumber("PAYROLL")
      
      const netSalary = (est.baseSalary ?? 0) + (est.overtimeTotal ?? 0) + (est.appreciationTotal ?? 0) - (est.loanDeduction ?? 0) - (est.lateDeduction ?? 0)
      
      await prisma.payroll.create({
        data: {
          documentNo,
          employeeId: emp.id,
          period,
          startDate: new Date(startDateStr),
          endDate: new Date(endDateStr),
          baseSalary: est.baseSalary ?? 0,
          overtimeTotal: est.overtimeTotal ?? 0,
          appreciationTotal: est.appreciationTotal ?? 0,
          loanDeduction: est.loanDeduction ?? 0,
          lateDeduction: est.lateDeduction,
          lateMinutes: est.lateMinutes,
          netSalary: netSalary,
          totalAmount: netSalary,
          status: "draft",
          createdBy: Number(user.id),
        }
      })
      count++
    }
  }

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
  const startDate = new Date(formData.get("startDate") as string)
  const endDate = new Date(formData.get("endDate") as string)

  // Auto-calculate late penalty
  let lateDeduction = safeNumber(formData.get("lateDeduction")) ?? 0
  let lateMinutes = safeNumber(formData.get("lateMinutes")) ?? 0

  if (employeeId && lateDeduction === 0) {
    const latePenalty = await calculateLatePenalty(employeeId, startDate, endDate)
    lateDeduction = latePenalty.totalPenalty
    lateMinutes = latePenalty.totalLateMinutes
  }

  const baseSalary = safeNumber(formData.get("baseSalary")) ?? 0
  const allowances = safeNumber(formData.get("allowances")) ?? 0
  const deductions = safeNumber(formData.get("deductions")) ?? 0
  const overtimeTotal = safeNumber(formData.get("overtimeTotal")) ?? 0
  const appreciationTotal = safeNumber(formData.get("appreciationTotal")) ?? 0
  const loanDeduction = safeNumber(formData.get("loanDeduction")) ?? 0
  const netSalary = safeNumber(formData.get("netSalary")) ?? (baseSalary + allowances + overtimeTotal + appreciationTotal - deductions - loanDeduction - lateDeduction)
  const totalAmount = safeNumber(formData.get("totalAmount")) ?? netSalary
  const paymentDateRaw = formData.get("paymentDate") as string | null

  const payroll = await prisma.payroll.create({
    data: {
      documentNo,
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
      netSalary,
      totalAmount,
      paymentDate: paymentDateRaw ? new Date(paymentDateRaw) : null,
      status: "draft",
      createdBy: Number(user.id),
    },
  })

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

  const baseSalary = safeNumber(formData.get("baseSalary")) ?? 0
  const allowances = safeNumber(formData.get("allowances")) ?? 0
  const deductions = safeNumber(formData.get("deductions")) ?? 0
  const overtimeTotal = safeNumber(formData.get("overtimeTotal")) ?? 0
  const appreciationTotal = safeNumber(formData.get("appreciationTotal")) ?? 0
  const loanDeduction = safeNumber(formData.get("loanDeduction")) ?? 0

  // Recalculate net_salary auto
  const netSalary = baseSalary + allowances + overtimeTotal + appreciationTotal - deductions - loanDeduction - lateDeduction
  const totalAmount = safeNumber(formData.get("totalAmount")) ?? netSalary
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
      netSalary,
      totalAmount,
      paymentDate: paymentDateRaw ? new Date(paymentDateRaw) : null,
    },
  })

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

  await prisma.payroll.update({
    where: { id: payrollId },
    data: { status: "paid", paymentDate: new Date() },
  })

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

  const totalAmount = requireNumber(formData.get("totalAmount"), "totalAmount")

  const loan = await prisma.employeeLoan.create({
    data: {
      employeeId: requireId(formData.get("employeeId"), "employeeId"),
      loanDate: new Date(formData.get("loanDate") as string),
      totalAmount,
      monthlyInstallment: requireNumber(formData.get("monthlyInstallment"), "monthlyInstallment"),
      remainingAmount: totalAmount,
      status: "active",
      notes: formData.get("notes") as string | null,
    },
  })

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

  const timesheet = await prisma.timesheet.create({
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

  const name = formData.get("name") as string
  const days = formData.getAll("days") as string[]
  const startTime = formData.get("startTime") as string
  const endTime = formData.get("endTime") as string
  const departmentId = safeNumber(formData.get("departmentId"))
  const lateToleranceMinutes = safeNumber(formData.get("lateToleranceMinutes")) ?? 0
  const isActive = formData.get("isActive") === "true"

  const schedules = days.map((day) => ({
    name,
    dayOfWeek: Number(day),
    startTime,
    endTime,
    departmentId,
    lateToleranceMinutes,
    isActive,
  }))

  await prisma.workSchedule.createMany({ data: schedules })

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

  const holiday = await prisma.holiday.create({
    data: {
      name: formData.get("name") as string,
      date: new Date(formData.get("date") as string),
      description: formData.get("description") as string | null,
    },
  })

  revalidatePath("/sdm/hari-libur")
  return { success: true, id: holiday.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createHoliday]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== DELETE ACTIONS ====================

export async function deleteLeaveRequest(id: number) {
  try {
  await requirePermission("delete_leave_requests")

  await prisma.leaveRequest.delete({ where: { id } })

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

  revalidatePath("/sdm/hari-libur")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteHoliday]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}


export async function updateLeaveRequest(id: number, formData: FormData) {
  "use server"

  try {

  await requirePermission("create_leave_requests")

  const leave = await prisma.leaveRequest.update({
    where: { id },
    data: {
      employeeId: requireId(formData.get("employeeId"), "employeeId"),
      type: formData.get("type") as string,
      startDate: new Date(formData.get("startDate") as string),
      endDate: new Date(formData.get("endDate") as string),
      reason: formData.get("reason") as string | null,
      status: "pending",
    },
  })

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

  const loan = await prisma.employeeLoan.update({
    where: { id },
    data: {
      employeeId: requireId(formData.get("employeeId"), "employeeId"),
      loanDate: new Date(formData.get("loanDate") as string),
      totalAmount,
      monthlyInstallment: requireNumber(formData.get("monthlyInstallment"), "monthlyInstallment"),
      remainingAmount: totalAmount,
      status: formData.get("status") as string || "active",
      notes: formData.get("notes") as string | null,
    },
  })

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
  const departmentId = safeNumber(formData.get("departmentId"))
  const lateToleranceMinutes = safeNumber(formData.get("lateToleranceMinutes")) ?? 0
  const isActive = formData.get("isActive") === "true"

  // Delete old record and create new ones for each day
  await prisma.workSchedule.delete({ where: { id } })

  const schedules = days.map((day) => ({
    name,
    dayOfWeek: Number(day),
    startTime,
    endTime,
    departmentId,
    lateToleranceMinutes,
    isActive,
  }))

  await prisma.workSchedule.createMany({ data: schedules })

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

  const holiday = await prisma.departmentHoliday.create({
    data: {
      departmentId: requireId(formData.get("departmentId"), "departmentId"),
      name: formData.get("name") as string,
      date: new Date(formData.get("date") as string),
      isRecurring: formData.get("isRecurring") === "on" || formData.get("isRecurring") === "true",
    },
  })

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

  const appreciation = await prisma.appreciation.create({
    data: {
      employeeId: requireId(formData.get("employeeId"), "employeeId"),
      date: new Date(formData.get("date") as string),
      type: (formData.get("type") as string) || "bonus",
      amount: safeNumber(formData.get("amount")) ?? 0,
      notes: formData.get("notes") as string | null,
    },
  })

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

  revalidatePath("/sdm/apresiasi")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteAppreciation]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
