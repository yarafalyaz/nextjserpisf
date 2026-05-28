"use server"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { revalidatePath } from "next/cache"
import { requireId, safeId, requireNumber, safeNumber, safeJsonParse } from "@/lib/utils/safe-parse"
import { calculateLatePenalty } from "@/lib/services/late-penalty.service"

// ==================== ATTENDANCE ACTIONS ====================

export async function checkIn(employeeId: number, latitude?: number, longitude?: number) {
  const user = await requirePermission("create_attendance")

  // Fix #40: Use timezone-aware date for WIB (UTC+7)
  const now = new Date()
  const wibOffset = 7 * 60 * 60 * 1000
  const wibNow = new Date(now.getTime() + wibOffset)
  const today = new Date(Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate()))

  // Check if already checked in today
  const existing = await prisma.attendance.findFirst({
    where: {
      employeeId,
      date: today,
    },
  })

  if (existing) {
    throw new Error("Sudah check-in hari ini")
  }

  const attendance = await prisma.attendance.create({
    data: {
      employeeId,
      date: today,
      checkIn: now,
      status: "present",
      checkInLatitude: latitude ?? null,
      checkInLongitude: longitude ?? null,
    },
  })

  revalidatePath("/sdm/absensi")
  return { success: true, id: attendance.id }
}

export async function checkOut(employeeId: number, latitude?: number, longitude?: number) {
  await requirePermission("edit_attendance")

  // Fix #40: Use timezone-aware date for WIB (UTC+7)
  const now = new Date()
  const wibOffset = 7 * 60 * 60 * 1000
  const wibNow = new Date(now.getTime() + wibOffset)
  const today = new Date(Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate()))

  const attendance = await prisma.attendance.findFirst({
    where: {
      employeeId,
      date: today,
      checkOut: null,
    },
  })

  if (!attendance) {
    throw new Error("Belum check-in atau sudah check-out hari ini")
  }

  await prisma.attendance.update({
    where: { id: attendance.id },
    data: {
      checkOut: now,
      checkOutLatitude: latitude ?? null,
      checkOutLongitude: longitude ?? null,
    },
  })

  revalidatePath("/sdm/absensi")
  return { success: true }
}

export async function createAttendance(formData: FormData) {
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
}

export async function updateAttendance(id: number, formData: FormData) {
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
}

// ==================== LEAVE REQUEST ACTIONS ====================

export async function createLeaveRequest(formData: FormData) {
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
}

export async function approveLeave(leaveId: number) {
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
}

export async function rejectLeave(leaveId: number, reason?: string) {
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
}

// ==================== OVERTIME REQUEST ACTIONS ====================

export async function createOvertimeRequest(formData: FormData) {
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
}

export async function approveOvertime(overtimeId: number) {
  const user = await requirePermission("edit_overtime_requests")

  await prisma.overtimeRequest.update({
    where: { id: overtimeId },
    data: { status: "approved", approvedBy: Number(user.id) },
  })

  revalidatePath("/sdm/lembur")
  return { success: true }
}

// ==================== PAYROLL ACTIONS ====================

export async function processPayroll(formData: FormData) {
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
}

export async function updatePayroll(id: number, formData: FormData) {
  await requirePermission("edit_payroll")

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
  const netSalary = safeNumber(formData.get("netSalary")) ?? (baseSalary + allowances + overtimeTotal + appreciationTotal - deductions - loanDeduction - lateDeduction)
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
}

export async function approvePayroll(payrollId: number) {
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
}

// ==================== EMPLOYEE LOAN ACTIONS ====================

export async function createEmployeeLoan(formData: FormData) {
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
}

// ==================== TIMESHEET ACTIONS ====================

export async function createTimesheet(formData: FormData) {
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
}

// ==================== WORK SCHEDULE ACTIONS ====================

export async function createWorkSchedule(formData: FormData) {
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
}

// ==================== HOLIDAY ACTIONS ====================

export async function createHoliday(formData: FormData) {
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
}

// ==================== DELETE ACTIONS ====================

export async function deleteLeaveRequest(id: number) {
  await requirePermission("delete_leave_requests")

  await prisma.leaveRequest.delete({ where: { id } })

  revalidatePath("/sdm/cuti")
  return { success: true }
}

export async function deleteOvertimeRequest(id: number) {
  await requirePermission("delete_overtime_requests")

  await prisma.overtimeRequest.delete({ where: { id } })

  revalidatePath("/sdm/lembur")
  return { success: true }
}

export async function deleteTimesheet(id: number) {
  await requirePermission("delete_timesheets")

  await prisma.timesheet.delete({ where: { id } })

  revalidatePath("/sdm/lembar-waktu")
  return { success: true }
}

export async function deleteEmployeeLoan(id: number) {
  await requirePermission("delete_loans")

  await prisma.employeeLoan.delete({ where: { id } })

  revalidatePath("/sdm/pinjaman")
  return { success: true }
}

export async function deleteWorkSchedule(id: number) {
  await requirePermission("delete_work_schedules")

  await prisma.workSchedule.delete({ where: { id } })

  revalidatePath("/sdm/jadwal-kerja")
  return { success: true }
}

export async function deleteHoliday(id: number) {
  await requirePermission("delete_holidays")

  await prisma.holiday.delete({ where: { id } })

  revalidatePath("/sdm/hari-libur")
  return { success: true }
}


export async function updateLeaveRequest(id: number, formData: FormData) {
  "use server"

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
}

export async function updateOvertimeRequest(id: number, formData: FormData) {
  "use server"

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
}

export async function updateEmployeeLoan(id: number, formData: FormData) {
  "use server"

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
}

export async function updateTimesheet(id: number, formData: FormData) {
  "use server"

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
}

export async function updateWorkSchedule(id: number, formData: FormData) {
  "use server"

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
}

// ==================== DEPARTMENT HOLIDAY ACTIONS ====================

export async function createDepartmentHoliday(formData: FormData) {
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
}

export async function updateDepartmentHoliday(formData: FormData) {
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
}

export async function deleteDepartmentHoliday(id: number) {
  await requirePermission("delete_holidays")

  await prisma.departmentHoliday.delete({ where: { id } })

  revalidatePath("/sdm/hari-libur-departemen")
  return { success: true }
}

// ==================== APPRECIATION ACTIONS ====================

export async function createAppreciation(formData: FormData) {
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
}

export async function updateAppreciation(formData: FormData) {
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
}

export async function deleteAppreciation(id: number) {
  await requirePermission("delete_appreciations")

  await prisma.appreciation.delete({ where: { id } })

  revalidatePath("/sdm/apresiasi")
  return { success: true }
}