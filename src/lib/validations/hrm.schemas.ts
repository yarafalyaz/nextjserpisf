import { z } from "zod"
import { dateOnly } from "@/lib/validations/finance.schemas"

// ==================== Helpers ====================

const optionalStr = (max = 500) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const requiredStr = (msg: string, max = 200) =>
  z.string().min(1, msg).max(max)

const requiredId = (field: string) =>
  z.coerce.number({ error: `${field} wajib diisi` }).int().positive()

const optionalId = z.coerce.number().int().positive().optional()

const optionalNum = (min?: number) => {
  const base = min !== undefined ? z.coerce.number().min(min) : z.coerce.number()
  return base.optional()
}

const requiredNum = (_field: string, min = 0) =>
  z.coerce.number().min(min)

// Tanggal kalender ketat (YYYY-MM-DD nyata): `new Date("2026-02-30")` di aksi
// menggulir diam-diam ke 2 Mar, jadi wajib ditolak di skema (pola dateOnly).
// optionalDate terima "" (form kosong) lewat refine — beda dari dateOnly.optional()
// murni yang akan menolak ""; perilaku itu dipakai skema payroll/refine di bawah.
const requiredDate = (_field: string) => dateOnly

const optionalDate = z
  .string()
  .optional()
  .refine(
    (v) => v === undefined || v === "" || dateOnly.safeParse(v).success,
    "Tanggal tidak valid",
  )

const optionalBool = z.boolean().optional()

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
  // F-2026-10-23-105-V: nominal cicilan mingguan dari perjanjian tertulis.
  // Kosong = null (tanpa jadwal mingguan); terisi wajib > 0 sen. TIDAK
  // dihitung otomatis dari monthlyInstallment.
  weeklyInstallment: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.coerce.number().positive("Cicilan mingguan harus lebih dari 0").nullable(),
  ),
  notes: optionalStr(500),
})

// ==================== Timesheet ====================

export const timesheetSchema = z.object({
  employeeId: requiredId("Karyawan"),
  // F-2026-10-21-019: tepat satu konteks (proyek XOR perintah kerja) —
  // keduanya opsional di skema; XOR ditegakkan di service (timesheet-context).
  projectId: optionalId,
  workOrderId: optionalId,
  taskId: optionalId,
  date: requiredDate("Tanggal"),
  startTime: optionalStr(10),
  endTime: optionalStr(10),
  // Cap per baris 24 jam (satu baris = satu sesi kerja satu hari kalender).
  hours: z.coerce.number().min(0.01).max(24),
  description: optionalStr(1000),
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
  costCenterId: optionalId,
})

// ==================== Kalender Kerja (hari libur & jadwal kerja) ====================

/**
 * Menormalkan hari kerja ke bentuk yang dibaca layanan absensi: angka hari
 * `0–6` (0 = Minggu) dipisah koma. Format ini DIVERIFIKASI dari pembacanya
 * (`daily-attendance.service.ts`, `attendance-summary.service.ts`,
 * `leave-quota.service.ts` yang memakai `workDays.split(",")` lalu menyaring
 * `0 <= hari <= 6`), bukan ditebak.
 *
 * Token kosong WAJIB dibuang sebelum `Number()`: `Number("")` bernilai 0, dan 0
 * adalah hari Minggu yang sah — sehingga teks dengan spasi/koma berlebih
 * ("1, 2") akan menyuntikkan hari Minggu secara diam-diam (terbukti: " 1 , 2 "
 * menghasilkan "0,1,2"). Hari yang salah = perhitungan absensi yang salah.
 */
export function normalizeWorkDays(raw: string | undefined | null): string {
  if (!raw) return ""
  const days = new Set<number>()
  for (const part of raw.split(/[\s,]+/)) {
    const token = part.trim()
    if (!token) continue
    const day = Number(token)
    if (Number.isInteger(day) && day >= 0 && day <= 6) days.add(day)
  }
  return [...days].sort((a, b) => a - b).join(",")
}

const timeString = (msg: string) =>
  z.string({ error: msg }).regex(/^([01]\d|2[0-3]):[0-5]\d$/, msg)

/**
 * Teks wajib dengan pesan yang terbaca pemakai.
 *
 * `parseFormData` mengubah string kosong menjadi `undefined`, sehingga pesan di
 * `.min(1)` tidak pernah tersentuh untuk masukan kosong dan pemakai melihat pesan
 * zod mentah ("expected string, received undefined"). Karena itu pesannya dipasang
 * di tingkat tipe string.
 */
const requiredText = (msg: string, max = 200) =>
  z.string({ error: msg }).trim().min(1, msg).max(max)

export const holidaySchema = z.object({
  name: requiredText("Nama hari libur wajib diisi", 150),
  date: requiredDate("Tanggal"),
  description: optionalStr(500),
})

export const departmentHolidaySchema = z.object({
  departmentId: requiredId("Departemen"),
  name: requiredText("Nama hari libur wajib diisi", 150),
  date: requiredDate("Tanggal"),
})

/**
 * P1-6: aturan statutori payroll berperiode. Perubahan tarif = baris BARU
 * dengan effectiveFrom baru (+ tutup baris lama via effectiveTo) — JANGAN
 * edit value baris lama (histori slip bergantung padanya via snapshot).
 * Key bebas; key dikenal mesin ada di RULE_KEYS (payroll-statutory.service).
 */
export const statutoryRuleSchema = z.object({
  key: z.string().trim().min(1, "Kunci wajib diisi").max(64)
    .regex(/^[a-z0-9_]+$/, "Kunci hanya huruf kecil, angka, garis bawah"),
  value: z.coerce.number({ error: "Nilai wajib diisi" }).finite(),
  effectiveFrom: requiredDate("Berlaku sejak"),
  effectiveTo: optionalDate,
  source: optionalStr(255),
})

export const workScheduleSchema = z.object({
  name: requiredText("Nama jadwal wajib diisi", 150),
  // Minimal satu hari: hari kosong akan membuat layanan absensi memakai fallback
  // Senin–Jumat secara DIAM-DIAM, sehingga jadwal yang sengaja dikosongkan tampak
  // berlaku sebagai hari kerja biasa. Lebih baik ditolak dengan pesan.
  workDays: z
    .string({ error: "Hari kerja tidak valid" })
    .optional()
    .transform((raw) => normalizeWorkDays(raw))
    .refine((value) => value.length > 0, "Pilih minimal satu hari kerja"),
  startTime: timeString("Jam mulai harus format HH:MM"),
  endTime: timeString("Jam selesai harus format HH:MM"),
  isActive: optionalBool,
})

/**
 * Status absensi. Nilai "late" khusus: `getDailyAttendanceMetrics` dan
 * `calculateLatePenalty` memperlakukannya sebagai terlambat, jadi jangan
 * mengganti ejaannya tanpa menyesuaikan kedua pembaca itu.
 */
export const ATTENDANCE_STATUSES = [
  "present",
  "late",
  "absent",
  "sick",
  "leave",
  "permission",
] as const

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]

export const attendanceSchema = z
  .object({
    employeeId: z.coerce.number({ error: "Karyawan wajib dipilih" }).int().positive(),
    date: dateOnly,
    checkIn: timeString("Jam masuk harus format HH:MM").optional(),
    checkOut: timeString("Jam keluar harus format HH:MM").optional(),
    status: z.enum(ATTENDANCE_STATUSES, { error: "Status absensi tidak dikenal" }),
    notes: z.string().max(500, "Catatan paling panjang 500 karakter").optional(),
  })
  .refine((v) => !v.checkIn || !v.checkOut || v.checkIn < v.checkOut, {
    error: "Jam keluar harus setelah jam masuk",
    path: ["checkOut"],
  })

// ==================== Attendance Correction (F-2026-10-25-010-S) ====================

/**
 * Pengajuan koreksi absensi. Nilai usulan dibatasi field rekod existing
 * (BR-AC-06); alasan wajib (BR-AC-04). Jendela tanggal ditegakkan server
 * (putusan Q-AC-1), bukan skema — bergantung hari berjalan WIB.
 */
export const attendanceCorrectionSchema = z
  .object({
    employeeId: requiredId("Karyawan"),
    date: requiredDate("Tanggal"),
    status: z.enum(ATTENDANCE_STATUSES, { error: "Status absensi tidak dikenal" }),
    checkIn: timeString("Jam masuk harus format HH:MM").optional(),
    checkOut: timeString("Jam keluar harus format HH:MM").optional(),
    notes: z.string().max(500, "Catatan paling panjang 500 karakter").optional(),
    reason: z
      .string({ error: "Alasan koreksi wajib diisi" })
      .trim()
      .min(1, "Alasan koreksi wajib diisi")
      .max(1000, "Alasan paling panjang 1000 karakter"),
  })
  .refine((v) => !v.checkIn || !v.checkOut || v.checkIn < v.checkOut, {
    error: "Jam keluar harus setelah jam masuk",
    path: ["checkOut"],
  })

// ==================== Inferred Types ====================

