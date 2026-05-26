"use server"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { revalidatePath } from "next/cache"

// ==================== ATTENDANCE ACTIONS ====================

export async function checkIn(employeeId: number) {
  const user = await requirePermission("create_attendance")

  const today = new Date()
  today.setHours(0, 0, 0, 0)

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
      checkIn: new Date(),
      status: "present",
    },
  })

  revalidatePath("/hrm/attendance")
  return { success: true, id: attendance.id }
}

export async function checkOut(employeeId: number) {
  await requirePermission("edit_attendance")

  const today = new Date()
  today.setHours(0, 0, 0, 0)

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
    data: { checkOut: new Date() },
  })

  revalidatePath("/hrm/attendance")
  return { success: true }
}

// ==================== LEAVE REQUEST ACTIONS ====================

export async function createLeaveRequest(formData: FormData) {
  await requirePermission("create_leave_requests")

  const leave = await prisma.leaveRequest.create({
    data: {
      employeeId: Number(formData.get("employeeId")),
      type: formData.get("type") as string,
      startDate: new Date(formData.get("startDate") as string),
      endDate: new Date(formData.get("endDate") as string),
      reason: formData.get("reason") as string | null,
      status: "pending",
    },
  })

  revalidatePath("/hrm/leave")
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

  revalidatePath("/hrm/leave")
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

  revalidatePath("/hrm/leave")
  return { success: true }
}

// ==================== OVERTIME REQUEST ACTIONS ====================

export async function createOvertimeRequest(formData: FormData) {
  await requirePermission("create_overtime_requests")

  const overtime = await prisma.overtimeRequest.create({
    data: {
      employeeId: Number(formData.get("employeeId")),
      date: new Date(formData.get("date") as string),
      hours: Number(formData.get("hours")),
      reason: formData.get("reason") as string | null,
      status: "pending",
    },
  })

  revalidatePath("/hrm/overtime")
  return { success: true, id: overtime.id }
}

export async function approveOvertime(overtimeId: number) {
  const user = await requirePermission("edit_overtime_requests")

  await prisma.overtimeRequest.update({
    where: { id: overtimeId },
    data: { status: "approved", approvedBy: Number(user.id) },
  })

  revalidatePath("/hrm/overtime")
  return { success: true }
}

// ==================== PAYROLL ACTIONS ====================

export async function processPayroll(formData: FormData) {
  const user = await requirePermission("create_payroll")

  const documentNo = await generateDocumentNumber("PAYROLL")

  const payroll = await prisma.payroll.create({
    data: {
      documentNo,
      period: formData.get("period") as string,
      startDate: new Date(formData.get("startDate") as string),
      endDate: new Date(formData.get("endDate") as string),
      totalAmount: Number(formData.get("totalAmount") || 0),
      status: "draft",
      createdBy: Number(user.id),
    },
  })

  revalidatePath("/hrm/payroll")
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

  revalidatePath("/hrm/payroll")
  return { success: true }
}

// ==================== EMPLOYEE LOAN ACTIONS ====================

export async function createEmployeeLoan(formData: FormData) {
  await requirePermission("create_loans")

  const loan = await prisma.employeeLoan.create({
    data: {
      employeeId: Number(formData.get("employeeId")),
      amount: Number(formData.get("amount")),
      installmentAmount: Number(formData.get("installmentAmount")),
      startDate: new Date(formData.get("startDate") as string),
      reason: formData.get("reason") as string | null,
      status: "active",
      remainingAmount: Number(formData.get("amount")),
    },
  })

  revalidatePath("/hrm/loans")
  return { success: true, id: loan.id }
}

// ==================== TIMESHEET ACTIONS ====================

export async function createTimesheet(formData: FormData) {
  await requirePermission("create_timesheets")

  const timesheet = await prisma.timesheet.create({
    data: {
      employeeId: Number(formData.get("employeeId")),
      projectId: formData.get("projectId") ? Number(formData.get("projectId")) : null,
      taskId: formData.get("taskId") ? Number(formData.get("taskId")) : null,
      date: new Date(formData.get("date") as string),
      hours: Number(formData.get("hours")),
      description: formData.get("description") as string | null,
    },
  })

  revalidatePath("/hrm/timesheets")
  return { success: true, id: timesheet.id }
}

// ==================== WORK SCHEDULE ACTIONS ====================

export async function createWorkSchedule(formData: FormData) {
  await requirePermission("create_work_schedules")

  const name = formData.get("name") as string
  const days = formData.getAll("days") as string[]
  const startTime = formData.get("startTime") as string
  const endTime = formData.get("endTime") as string

  const schedules = days.map((day) => ({
    name,
    dayOfWeek: Number(day),
    startTime,
    endTime,
  }))

  await prisma.workSchedule.createMany({ data: schedules })

  revalidatePath("/hrm/work-schedules")
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

  revalidatePath("/hrm/holidays")
  return { success: true, id: holiday.id }
}

// ==================== DELETE ACTIONS ====================

export async function deleteLeaveRequest(id: number) {
  await requirePermission("delete_leave_requests")

  await prisma.leaveRequest.delete({ where: { id } })

  revalidatePath("/hrm/leave")
  return { success: true }
}

export async function deleteOvertimeRequest(id: number) {
  await requirePermission("delete_overtime_requests")

  await prisma.overtimeRequest.delete({ where: { id } })

  revalidatePath("/hrm/overtime")
  return { success: true }
}

export async function deleteTimesheet(id: number) {
  await requirePermission("delete_timesheets")

  await prisma.timesheet.delete({ where: { id } })

  revalidatePath("/hrm/timesheets")
  return { success: true }
}

export async function deleteEmployeeLoan(id: number) {
  await requirePermission("delete_loans")

  await prisma.employeeLoan.delete({ where: { id } })

  revalidatePath("/hrm/loans")
  return { success: true }
}

export async function deleteWorkSchedule(id: number) {
  await requirePermission("delete_work_schedules")

  await prisma.workSchedule.delete({ where: { id } })

  revalidatePath("/hrm/work-schedules")
  return { success: true }
}

export async function deleteHoliday(id: number) {
  await requirePermission("delete_holidays")

  await prisma.holiday.delete({ where: { id } })

  revalidatePath("/hrm/holidays")
  return { success: true }
}


export async function updateLeaveRequest(id: number, formData: FormData) {
  "use server"

  await requirePermission("create_leave_requests")

  const leave = await prisma.leaveRequest.update({
    where: { id },
    data: {
      employeeId: Number(formData.get("employeeId")),
      type: formData.get("type") as string,
      startDate: new Date(formData.get("startDate") as string),
      endDate: new Date(formData.get("endDate") as string),
      reason: formData.get("reason") as string | null,
      status: "pending",
    },
  })

  revalidatePath("/hrm/leave")
  return { success: true, id: leave.id }
}

export async function updateOvertimeRequest(id: number, formData: FormData) {
  "use server"

  await requirePermission("create_overtime_requests")

  const overtime = await prisma.overtimeRequest.update({
    where: { id },
    data: {
      employeeId: Number(formData.get("employeeId")),
      date: new Date(formData.get("date") as string),
      hours: Number(formData.get("hours")),
      reason: formData.get("reason") as string | null,
      status: "pending",
    },
  })

  revalidatePath("/hrm/overtime")
  return { success: true, id: overtime.id }
}

export async function updateEmployeeLoan(id: number, formData: FormData) {
  "use server"

  await requirePermission("create_loans")

  const loan = await prisma.employeeLoan.update({
    where: { id },
    data: {
      employeeId: Number(formData.get("employeeId")),
      amount: Number(formData.get("amount")),
      installmentAmount: Number(formData.get("installmentAmount")),
      startDate: new Date(formData.get("startDate") as string),
      reason: formData.get("reason") as string | null,
      status: "active",
      remainingAmount: Number(formData.get("amount")),
    },
  })

  revalidatePath("/hrm/loans")
  return { success: true, id: loan.id }
}

export async function updateTimesheet(id: number, formData: FormData) {
  "use server"

  await requirePermission("create_timesheets")

  const timesheet = await prisma.timesheet.update({
    where: { id },
    data: {
      employeeId: Number(formData.get("employeeId")),
      projectId: formData.get("projectId") ? Number(formData.get("projectId")) : null,
      taskId: formData.get("taskId") ? Number(formData.get("taskId")) : null,
      date: new Date(formData.get("date") as string),
      hours: Number(formData.get("hours")),
      description: formData.get("description") as string | null,
    },
  })

  revalidatePath("/hrm/timesheets")
  return { success: true, id: timesheet.id }
}

export async function updateWorkSchedule(id: number, formData: FormData) {
  "use server"

  await requirePermission("create_work_schedules")

  const name = formData.get("name") as string
  const days = formData.getAll("days") as string[]
  const startTime = formData.get("startTime") as string
  const endTime = formData.get("endTime") as string

  const schedules = days.map((day) => ({
    name,
    dayOfWeek: Number(day),
    startTime,
    endTime,
  }))

  await prisma.workSchedule.createMany({ data: schedules })

  revalidatePath("/hrm/work-schedules")
  return { success: true }
}