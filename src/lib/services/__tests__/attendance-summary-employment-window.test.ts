import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  employee: vi.fn(),
  workSchedule: vi.fn(),
  holiday: vi.fn(),
  departmentHoliday: vi.fn(),
  attendance: vi.fn(),
  leaveRequest: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    employee: { findUnique: mocks.employee },
    workSchedule: { findMany: mocks.workSchedule },
    holiday: { findMany: mocks.holiday },
    departmentHoliday: { findMany: mocks.departmentHoliday },
    attendance: { findMany: mocks.attendance },
    leaveRequest: { findMany: mocks.leaveRequest },
  },
}))

import {
  calculateAttendanceSummary,
  employmentDayWindow,
  isEmploymentDay,
} from "../attendance-summary.service"

const d = (s: string) => new Date(`${s}T00:00:00Z`)

// Periode uji: September 2026 (Selasa 1 Sep – Rabu 30 Sep), jadwal default
// Senin–Jumat (jadwal kosong → fallback 1..5 di service).
const START = d("2026-09-01")
const END = d("2026-09-30")

beforeEach(() => {
  vi.clearAllMocks()
  // Satu jadwal global Senin–Jumat. Jadwal kosong BUKAN fallback service:
  // "".split(",") menghasilkan Number("")===0 (Minggu) — lihat catatan test.
  mocks.workSchedule.mockResolvedValue([
    {
      workDays: "1,2,3,4,5",
      _count: { employees: 0, departments: 0 },
      employees: [],
      departments: [],
    },
  ])
  mocks.holiday.mockResolvedValue([])
  mocks.departmentHoliday.mockResolvedValue([])
  mocks.attendance.mockResolvedValue([])
  mocks.leaveRequest.mockResolvedValue([])
})

function employee(joinDate: Date, employmentEndedAt: Date | null = null) {
  mocks.employee.mockResolvedValue({
    id: 7,
    departmentId: null,
    baseSalary: 4_400_000,
    joinDate,
    employmentEndedAt,
  })
}

describe("jendela masa kerja ringkasan absensi", () => {
  it("helper murni: batas join & berhenti inklusif", () => {
    const w = employmentDayWindow(d("2026-09-16"), d("2026-09-25"))
    expect(isEmploymentDay("2026-09-15", w)).toBe(false)
    expect(isEmploymentDay("2026-09-16", w)).toBe(true)
    expect(isEmploymentDay("2026-09-25", w)).toBe(true)
    expect(isEmploymentDay("2026-09-26", w)).toBe(false)
    const open = employmentDayWindow(null, null)
    expect(isEmploymentDay("2020-01-01", open)).toBe(true)
  })

  it("gabung 16 Sep: hari sebelum gabung BUKAN absent (dulu 11 absent semu)", async () => {
    employee(d("2026-09-16"))
    // Hadir semua hari kerja sesudah gabung: 16,17,18,21,22,23,24,25,28,29,30.
    mocks.attendance.mockResolvedValue(
      [16, 17, 18, 21, 22, 23, 24, 25, 28, 29, 30].map((day) => ({
        date: d(`2026-09-${String(day).padStart(2, "0")}`),
      })),
    )
    const s = await calculateAttendanceSummary(7, START, END)
    expect(s.presentDays).toBe(11)
    expect(s.absentDays).toBe(0)
    expect(s.absentDeduction).toBe(0)
    expect(s.totalWorkingDays).toBe(11)
  })

  it("berhenti 10 Sep: hari sesudah berhenti BUKAN absent", async () => {
    employee(d("2025-01-05"), d("2026-09-10"))
    mocks.attendance.mockResolvedValue(
      [1, 2, 3, 4, 7, 8, 9, 10].map((day) => ({
        date: d(`2026-09-${String(day).padStart(2, "0")}`),
      })),
    )
    const s = await calculateAttendanceSummary(7, START, END)
    expect(s.presentDays).toBe(8)
    expect(s.absentDays).toBe(0)
    expect(s.totalWorkingDays).toBe(8)
  })

  it("absent di DALAM masa kerja tetap terpotong", async () => {
    employee(d("2026-09-16"))
    // Tanpa kehadiran sama sekali: 11 hari kerja masa kerja semua absent.
    const s = await calculateAttendanceSummary(7, START, END)
    expect(s.absentDays).toBe(11)
    // dailyRate = 4.400.000 / 11 hari kerja masa kerja = 400.000.
    expect(s.dailyRate).toBe(400_000)
    expect(s.absentDeduction).toBe(4_400_000)
  })

  it("karyawan penuh periode: perilaku lama persis (22 hari kerja Sep 2026)", async () => {
    employee(d("2025-01-05"))
    const s = await calculateAttendanceSummary(7, START, END)
    expect(s.totalWorkingDays).toBe(22)
    expect(s.absentDays).toBe(22)
    expect(s.dailyRate).toBe(200_000)
  })

  it("tanpa jadwal sama sekali: fallback Senin–Jumat hidup (bukan Minggu saja)", async () => {
    mocks.workSchedule.mockResolvedValue([])
    employee(d("2025-01-05"))
    const s = await calculateAttendanceSummary(7, START, END)
    expect(s.totalWorkingDays).toBe(22)
  })

  it("guard statis: estimator massa memakai jendela yang sama", async () => {
    const { readFileSync } = await import("node:fs")
    const actions = readFileSync("src/actions/hrm.actions.ts", "utf8")
    expect(actions).toContain(
      "const employmentWindow = employmentDayWindow(employee.joinDate, employee.employmentEndedAt);",
    )
    expect(actions).toContain("if (!isEmploymentDay(key, employmentWindow)) continue;")
  })
})
