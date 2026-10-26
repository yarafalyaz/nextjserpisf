import { describe, expect, it } from "vitest"

import {
  ATTENDANCE_RECAP_NOTICE,
  buildAttendanceRecap,
  type AttendanceRecapEmployeeInput,
} from "../attendance-recap"

const d = (s: string) => new Date(`${s}T00:00:00`)
const TODAY = d("2026-10-07") // Rabu
// Periode Sen 2026-10-05 .. Jum 2026-10-09; jadwal Sen-Jum.
const WEEK = [d("2026-10-05"), d("2026-10-06"), d("2026-10-07"), d("2026-10-08"), d("2026-10-09")]

function emp(overrides: Partial<AttendanceRecapEmployeeInput> = {}): AttendanceRecapEmployeeInput {
  return {
    employeeId: 1,
    employeeName: "Budi",
    departmentId: 10,
    departmentName: "Bengkel",
    hasSchedule: true,
    scheduledDays: WEEK,
    holidayDays: [],
    records: [],
    approvedLeaveDays: [],
    ...overrides,
  }
}

function rec(date: string, status: string, extra: Partial<{ hasCheckIn: boolean; lateMinutes: number; overtimeMinutes: number | null }> = {}) {
  return {
    date: d(date),
    status,
    hasCheckIn: extra.hasCheckIn ?? true,
    lateMinutes: extra.lateMinutes ?? 0,
    overtimeMinutes: extra.overtimeMinutes ?? null,
  }
}

describe("buildAttendanceRecap (F-2026-10-25-044-S)", () => {
  it("AC-ATT-B1: invariant terevaluasi = hadir+sakit+cuti+alpa+setengah+lain+tanpa rekod", () => {
    const recap = buildAttendanceRecap(
      [
        emp({
          records: [
            rec("2026-10-05", "present"),
            rec("2026-10-06", "sick"),
            // 2026-10-07 (hari ini) tanpa rekod
          ],
        }),
      ],
      TODAY,
    )
    const e = recap.employees[0]
    expect(e.scheduledWorkDays).toBe(5)
    expect(e.scheduledEvaluatedDays).toBe(3) // Sen-Rab (<= hari ini)
    expect(e.futureScheduledDays).toBe(2) // Kam-Jum EC-5
    expect(e.presentDays).toBe(1)
    expect(e.sickDays).toBe(1)
    expect(e.noRecordDays).toBe(1)
    expect(
      e.presentDays + e.sickDays + e.leaveDays + e.absentDays + e.halfDayDays + e.otherStatusDays + (e.noRecordDays ?? 0),
    ).toBe(e.scheduledEvaluatedDays)
  })

  it("EC-1/BR-ATT-02: sick dengan checkIn = ember sakit, bukan hadir (payroll menghitung lain — sengaja)", () => {
    const recap = buildAttendanceRecap(
      [emp({ records: [rec("2026-10-05", "sick", { hasCheckIn: true })] })],
      TODAY,
    )
    expect(recap.employees[0].sickDays).toBe(1)
    expect(recap.employees[0].presentDays).toBe(0)
  })

  it("BR-ATT-02: leave dari status ATAU LeaveRequest approved (EC-2/EC-3); half_day ember sendiri; absent tercatat", () => {
    const recap = buildAttendanceRecap(
      [
        emp({
          records: [
            rec("2026-10-05", "leave", { hasCheckIn: false }),
            rec("2026-10-06", "half_day"),
            rec("2026-10-07", "absent", { hasCheckIn: false }),
          ],
          approvedLeaveDays: [d("2026-10-07")], // absent tercatat menang atas cuti pada tanggal sama? tidak: status absent dicek sebelum leaveSet — lihat di bawah
        }),
      ],
      TODAY,
    )
    const e = recap.employees[0]
    expect(e.leaveDays).toBe(1)
    expect(e.halfDayDays).toBe(1)
    expect(e.absentDays).toBe(1)
  })

  it("EC-2: cuti approved tanpa baris Attendance = ember cuti, bukan tanpa rekod", () => {
    const recap = buildAttendanceRecap(
      [emp({ approvedLeaveDays: [d("2026-10-05"), d("2026-10-06")] })],
      TODAY,
    )
    expect(recap.employees[0].leaveDays).toBe(2)
    expect(recap.employees[0].noRecordDays).toBe(1) // hanya 2026-10-07
  })

  it("BR-ATT-03: tanpa rekod terpisah dari alpa tercatat", () => {
    const recap = buildAttendanceRecap(
      [emp({ records: [rec("2026-10-05", "absent", { hasCheckIn: false })] })],
      TODAY,
    )
    const e = recap.employees[0]
    expect(e.absentDays).toBe(1)
    expect(e.noRecordDays).toBe(2)
  })

  it("EC-8: terlambat dari lateMinutes pada status apa pun; Σ menit + lembur tercatat terpisah", () => {
    const recap = buildAttendanceRecap(
      [
        emp({
          records: [
            rec("2026-10-05", "present", { lateMinutes: 15, overtimeMinutes: 60 }),
            rec("2026-10-06", "late", { lateMinutes: 5, overtimeMinutes: null }),
            rec("2026-10-07", "present", { lateMinutes: 0 }),
          ],
        }),
      ],
      TODAY,
    )
    const e = recap.employees[0]
    expect(e.lateEventCount).toBe(2)
    expect(e.totalLateMinutes).toBe(20)
    expect(e.totalOvertimeMinutes).toBe(60)
    expect(e.presentDays).toBe(3) // status late + checkIn = hadir
  })

  it("AC-ATT-B5: status di luar kosakata tanpa checkIn terhitung ember status lain, tidak dibuang", () => {
    const recap = buildAttendanceRecap(
      [emp({ records: [rec("2026-10-05", "dinas_luar", { hasCheckIn: false })] })],
      TODAY,
    )
    const e = recap.employees[0]
    expect(e.otherStatusDays).toBe(1)
    expect(e.recordCount).toBe(1)
  })

  it("hari libur keluar dari invariant dan dari hari kerja", () => {
    const recap = buildAttendanceRecap(
      [emp({ holidayDays: [d("2026-10-06")] })],
      TODAY,
    )
    const e = recap.employees[0]
    expect(e.holidayDays).toBe(1)
    expect(e.scheduledWorkDays).toBe(4)
    expect(e.scheduledEvaluatedDays).toBe(2)
  })

  it("BR-ATT-04: tanpa jadwal -> hari kerja null (bukan 0), ember dari rekod apa adanya", () => {
    const recap = buildAttendanceRecap(
      [
        emp({
          hasSchedule: false,
          scheduledDays: [],
          records: [rec("2026-10-05", "present")],
        }),
      ],
      TODAY,
    )
    const e = recap.employees[0]
    expect(e.scheduledWorkDays).toBeNull()
    expect(e.scheduledEvaluatedDays).toBeNull()
    expect(e.noRecordDays).toBeNull()
    expect(e.presentDays).toBe(1)
    expect(recap.totals.unscheduledEmployeeCount).toBe(1)
  })

  it("karyawan tanpa data sama sekali: kosong jujur (0 rekod, tanpa rekod = hari terevaluasi)", () => {
    const recap = buildAttendanceRecap([emp({})], TODAY)
    const e = recap.employees[0]
    expect(e.recordCount).toBe(0)
    expect(e.presentDays).toBe(0)
    expect(e.noRecordDays).toBe(3)
  })

  it("EC-4: dedup defensif tanggal ganda", () => {
    const recap = buildAttendanceRecap(
      [emp({ records: [rec("2026-10-05", "present"), rec("2026-10-05", "absent", { hasCheckIn: false })] })],
      TODAY,
    )
    expect(recap.employees[0].recordCount).toBe(1)
    expect(recap.employees[0].presentDays).toBe(1)
  })

  it("vonis 045-V Putusan 4: notice verbatim memuat 3 isi wajib; payload tanpa nominal uang", () => {
    expect(ATTENDANCE_RECAP_NOTICE).toContain("bukan dasar potongan gaji")
    expect(ATTENDANCE_RECAP_NOTICE).toContain("definisi check-in service payroll")
    expect(ATTENDANCE_RECAP_NOTICE).toContain("Tanpa rekod bukan alpa")
    const recap = buildAttendanceRecap([emp({ records: [rec("2026-10-05", "present")] })], TODAY)
    const json = JSON.stringify(recap)
    for (const banned of ["baseSalary", "dailyRate", "absentDeduction", "lateDeduction", "penaltyPerMinute"]) {
      expect(json).not.toContain(banned)
    }
    expect(recap.notice).toBe(ATTENDANCE_RECAP_NOTICE)
  })

  it("total = penjumlahan baris (bukan rata-rata)", () => {
    const recap = buildAttendanceRecap(
      [
        emp({ records: [rec("2026-10-05", "present", { lateMinutes: 10 })] }),
        emp({ employeeId: 2, employeeName: "Sari", records: [rec("2026-10-05", "sick", { hasCheckIn: false })] }),
      ],
      TODAY,
    )
    expect(recap.totals.employeeCount).toBe(2)
    expect(recap.totals.presentDays).toBe(1)
    expect(recap.totals.sickDays).toBe(1)
    expect(recap.totals.totalLateMinutes).toBe(10)
  })
})
