import { z } from "zod"

// ==================== Helpers ====================

const optionalStr = (max = 500) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const requiredStr = (msg: string, max = 200) =>
  z.string().min(1, msg).max(max)

const requiredId = (field: string) =>
  z.number({ error: `${field} wajib diisi` }).int().positive()

const optionalId = z.number().int().positive().optional()

const optionalNum = (min?: number) => {
  const base = min !== undefined ? z.number().min(min) : z.number()
  return base.optional()
}

const requiredNum = (_field: string, min = 0) =>
  z.number().min(min)

const requiredDate = (field: string) =>
  z.string().min(1, `${field} wajib diisi`)

const optionalDate = z.string().optional()

const optionalBool = z.boolean().optional()

// ==================== Attendance ====================

export const attendanceSchema = z.object({
  employeeId: requiredId("Karyawan"),
  date: requiredDate("Tanggal"),
  checkIn: optionalDate,
  checkOut: optionalDate,
  status: z.string().default("present"),
  checkInLatitude: optionalNum(),
  checkInLongitude: optionalNum(),
  checkOutLatitude: optionalNum(),
  checkOutLongitude: optionalNum(),
  overtimeMinutes: optionalNum(0),
  overtimeApproved: optionalBool,
})

// ==================== Leave Request ====================

export const leaveRequestSchema = z.object({
  employeeId: requiredId("Karyawan"),
  type: requiredStr("Jenis cuti wajib diisi"),
  startDate: requiredDate("Tanggal mulai"),
  endDate: requiredDate("Tanggal selesai"),
  reason: optionalStr(500),
})

// ==================== Overtime Request ====================

export const overtimeRequestSchema = z.object({
  employeeId: requiredId("Karyawan"),
  projectId: optionalId,
  date: requiredDate("Tanggal"),
  hours: requiredNum("Jam", 0.01),
  totalHours: optionalNum(0),
  mealHours: optionalNum(0),
  billableHours: optionalNum(0),
  reason: optionalStr(500),
})

// ==================== Employee Loan ====================

export const employeeLoanSchema = z.object({
  employeeId: requiredId("Karyawan"),
  loanDate: requiredDate("Tanggal pinjaman"),
  totalAmount: requiredNum("Total pinjaman", 1),
  monthlyInstallment: requiredNum("Cicilan bulanan", 1),
  notes: optionalStr(500),
})

// ==================== Timesheet ====================

export const timesheetSchema = z.object({
  employeeId: requiredId("Karyawan"),
  projectId: requiredId("Proyek"),
  taskId: optionalId,
  date: requiredDate("Tanggal"),
  startTime: optionalStr(10),
  endTime: optionalStr(10),
  hours: requiredNum("Jam", 0.01),
  description: optionalStr(1000),
})

// ==================== Work Schedule ====================

export const workScheduleSchema = z.object({
  name: requiredStr("Nama jadwal wajib diisi"),
  startTime: requiredStr("Jam masuk wajib diisi", 10),
  endTime: requiredStr("Jam keluar wajib diisi", 10),
  lateToleranceMinutes: optionalNum(0),
  isActive: optionalBool,
})

// ==================== Holiday ====================

export const holidaySchema = z.object({
  name: requiredStr("Nama hari libur wajib diisi"),
  date: requiredDate("Tanggal"),
  description: optionalStr(500),
})

// ==================== Department Holiday ====================

export const departmentHolidaySchema = z.object({
  id: optionalId,
  departmentId: requiredId("Departemen"),
  name: requiredStr("Nama wajib diisi"),
  date: requiredDate("Tanggal"),
  isRecurring: optionalBool,
})

// ==================== Appreciation ====================

export const appreciationSchema = z.object({
  id: optionalId,
  employeeId: requiredId("Karyawan"),
  date: requiredDate("Tanggal"),
  type: z.string().default("bonus"),
  amount: optionalNum(0),
  notes: optionalStr(500),
})

// ==================== Payroll ====================

export const payrollSchema = z.object({
  employeeId: optionalId,
  period: requiredStr("Periode wajib diisi", 50),
  startDate: requiredDate("Tanggal mulai"),
  endDate: requiredDate("Tanggal selesai"),
  baseSalary: optionalNum(0),
  allowances: optionalNum(0),
  deductions: optionalNum(0),
  overtimeTotal: optionalNum(0),
  appreciationTotal: optionalNum(0),
  loanDeduction: optionalNum(0),
  lateDeduction: optionalNum(0),
  lateMinutes: optionalNum(0),
  workingDays: optionalNum(0),
  presentDays: optionalNum(0),
  absentDays: optionalNum(0),
  absentDeduction: optionalNum(0),
  totalAmount: optionalNum(0),
  paymentDate: optionalDate,
  recalcLate: optionalBool,
})

// ==================== Inferred Types ====================

export type AttendanceInput = z.infer<typeof attendanceSchema>
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>
export type OvertimeRequestInput = z.infer<typeof overtimeRequestSchema>
export type EmployeeLoanInput = z.infer<typeof employeeLoanSchema>
export type TimesheetInput = z.infer<typeof timesheetSchema>
export type WorkScheduleInput = z.infer<typeof workScheduleSchema>
export type HolidayInput = z.infer<typeof holidaySchema>
export type DepartmentHolidayInput = z.infer<typeof departmentHolidaySchema>
export type AppreciationInput = z.infer<typeof appreciationSchema>
export type PayrollInput = z.infer<typeof payrollSchema>
