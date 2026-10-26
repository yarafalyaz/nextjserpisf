/**
 * Rekap kehadiran per karyawan per periode (F-2026-10-25-044-S,
 * BR-ATT-01..10; vonis batas F-2026-10-25-045-V BR-ATT-09).
 *
 * Builder murni (tanpa Prisma/DOM): menerima per karyawan baris Attendance
 * polos + tanggal cuti approved + definisi hari kerja yang SUDAH diturunkan
 * loader (`attendance-recap-data.ts`) dari precedence existing
 * (jadwal karyawan > departemen > global; Holiday + DepartmentHoliday;
 * evaluasi hanya sampai hari ini — pola `attendance-summary.service.ts`),
 * lalu mengelompokkan per karyawan per periode.
 *
 * Definisi ember BR-ATT-02 (dibekukan spec + disahkan vonis 045-V Putusan 1;
 * BERBEDA sengaja dari service payroll yang menghitung hadir dari
 * `checkIn != null` tanpa membaca status — service itu BEKU, tidak diubah
 * dan tidak dipanggil dari sini, AC-ATT-V3/V5):
 *  - sakit      = status `sick` (walau ada checkIn — EC-1)
 *  - cuti/izin  = status `leave` ATAU tanggal tercakup LeaveRequest approved
 *  - setengah   = status `half_day` (ember sendiri, tidak dicampur hadir)
 *  - alpa       = status `absent` (alpa TERCATAT)
 *  - hadir      = ada baris, checkIn != null, status bukan ember di atas
 *  - status lain = baris berstatus di luar kosakata yang tidak memenuhi
 *    hadir (mis. tanpa checkIn) — terhitung apa adanya, tidak dibuang
 *    (AC-ATT-B5)
 * Hari kerja terjadwal terevaluasi (<= hari ini, bukan libur) tanpa baris
 * dan tanpa cuti approved = "tanpa rekod" (BR-ATT-03) — BUKAN alpa.
 * Hari libur dan hari sesudah hari ini di luar invariant.
 *
 * Invariant per karyawan terjadwal (AC-ATT-B1):
 *   scheduledEvaluatedDays = presentDays + sickDays + leaveDays +
 *     absentDays + halfDayDays + otherStatusDays + noRecordDays
 *
 * Keluaran TANPA nominal uang apa pun (BR-ATT-05, vonis Putusan 2): tanpa
 * baseSalary/dailyRate/absentDeduction/lateDeduction. Rekap dilarang jadi
 * dasar potongan kedua; payroll satu-satunya jalur angka potongan.
 * `overtimeMinutes` = menit lembur TERCATAT di rekod kehadiran
 * (BR-ATT-08) — tidak dijumlahkan dengan jam OvertimeRequest 016-S.
 * Karyawan tanpa jadwal terikat: `hasSchedule=false`, hari kerja null
 * (tidak diturunkan — BR-ATT-04), bukan 0 karangan.
 * Baca-saja murni (BR-ATT-10).
 */

import { toLocalDateOnly } from "@/lib/utils/date-only"

export const ATTENDANCE_RECAP_NOTICE =
  "Rekap kehadiran operasional — bukan dasar potongan gaji. " +
  "Ember mengikuti klasifikasi status rekod; angka potongan payroll memakai " +
  "definisi check-in service payroll sehingga jumlah hadir/alpa rekap dapat " +
  "berbeda dari dasar potongan slip untuk orang dan periode yang sama. " +
  "Tanpa rekod bukan alpa: hari kerja tanpa rekod kehadiran dan tanpa cuti " +
  "disetujui ditampilkan terpisah dari alpa tercatat."

export const ATTENDANCE_RECAP_NO_DEPARTMENT_LABEL = "Tanpa departemen"
export const ATTENDANCE_RECAP_NO_SCHEDULE_LABEL = "Tanpa jadwal"

export interface AttendanceRecapDayInput {
  /** Tanggal rekod (kolom `date`), kunci hari kalender lokal. */
  date: Date
  status: string
  hasCheckIn: boolean
  lateMinutes: number
  overtimeMinutes: number | null
}

export interface AttendanceRecapEmployeeInput {
  employeeId: number
  employeeName: string | null
  departmentId: number | null
  departmentName: string | null
  /** false = tanpa jadwal terikat; hari kerja tidak diturunkan (BR-ATT-04). */
  hasSchedule: boolean
  /** Hari kerja terjadwal dalam periode (termasuk libur & hari mendatang). */
  scheduledDays: readonly Date[]
  /** Tanggal libur (Holiday + DepartmentHoliday) dalam scheduledDays. */
  holidayDays: readonly Date[]
  /** Baris Attendance dalam periode (kolom `date`, BR-ATT-07). */
  records: readonly AttendanceRecapDayInput[]
  /** Tanggal tercakup LeaveRequest approved dalam periode. */
  approvedLeaveDays: readonly Date[]
}

export interface AttendanceRecapEmployee {
  employeeId: number
  employeeName: string | null
  departmentId: number | null
  departmentName: string | null
  hasSchedule: boolean
  /** null bila tanpa jadwal — tidak diturunkan, bukan 0 (BR-ATT-04). */
  scheduledWorkDays: number | null
  scheduledEvaluatedDays: number | null
  holidayDays: number | null
  /** Hari terjadwal sesudah hari ini: belum terevaluasi (EC-5). */
  futureScheduledDays: number | null
  presentDays: number
  sickDays: number
  leaveDays: number
  absentDays: number
  halfDayDays: number
  otherStatusDays: number
  noRecordDays: number | null
  lateEventCount: number
  totalLateMinutes: number
  totalOvertimeMinutes: number
  recordCount: number
}

export interface AttendanceRecap {
  notice: string
  employees: AttendanceRecapEmployee[]
  totals: {
    employeeCount: number
    scheduledEmployeeCount: number
    unscheduledEmployeeCount: number
    scheduledWorkDays: number
    scheduledEvaluatedDays: number
    holidayDays: number
    futureScheduledDays: number
    presentDays: number
    sickDays: number
    leaveDays: number
    absentDays: number
    halfDayDays: number
    otherStatusDays: number
    noRecordDays: number
    lateEventCount: number
    totalLateMinutes: number
    totalOvertimeMinutes: number
    recordCount: number
  }
}

function dayKey(date: Date): string {
  return toLocalDateOnly(date)
}

function classifyDay(
  record: AttendanceRecapDayInput | undefined,
  onApprovedLeave: boolean,
): "present" | "sick" | "leave" | "absent" | "halfDay" | "other" | "noRecord" {
  if (record) {
    if (record.status === "sick") return "sick"
    if (record.status === "leave") return "leave"
    if (record.status === "half_day") return "halfDay"
    if (record.status === "absent") return "absent"
    if (record.hasCheckIn) return "present"
    return "other"
  }
  if (onApprovedLeave) return "leave"
  return "noRecord"
}

export function buildAttendanceRecap(
  inputs: readonly AttendanceRecapEmployeeInput[],
  today: Date,
): AttendanceRecap {
  const todayKey = dayKey(today)
  const employees: AttendanceRecapEmployee[] = inputs.map((input) => {
    // EC-4: dedup defensif per tanggal (unik DB [employeeId, date]).
    const recordByDay = new Map<string, AttendanceRecapDayInput>()
    for (const record of input.records) {
      const key = dayKey(record.date)
      if (!recordByDay.has(key)) recordByDay.set(key, record)
    }
    const leaveSet = new Set(input.approvedLeaveDays.map(dayKey))
    const holidaySet = new Set(input.holidayDays.map(dayKey))

    let presentDays = 0
    let sickDays = 0
    let leaveDays = 0
    let absentDays = 0
    let halfDayDays = 0
    let otherStatusDays = 0
    let lateEventCount = 0
    let totalLateMinutes = 0
    let totalOvertimeMinutes = 0

    // Fakta rekod dihitung dari semua baris periode, termasuk hari libur /
    // di luar jadwal: barisnya ada, faktanya tampil apa adanya.
    for (const record of recordByDay.values()) {
      if (record.lateMinutes > 0) {
        lateEventCount += 1
        totalLateMinutes += record.lateMinutes
      }
      totalOvertimeMinutes += record.overtimeMinutes ?? 0
    }

    let scheduledWorkDays: number | null = null
    let scheduledEvaluatedDays: number | null = null
    let holidayCount: number | null = null
    let futureScheduledDays: number | null = null
    let noRecordDays: number | null = null

    if (input.hasSchedule) {
      scheduledWorkDays = 0
      scheduledEvaluatedDays = 0
      holidayCount = 0
      futureScheduledDays = 0
      noRecordDays = 0
      const seenScheduled = new Set<string>()
      for (const day of input.scheduledDays) {
        const key = dayKey(day)
        if (seenScheduled.has(key)) continue
        seenScheduled.add(key)
        if (holidaySet.has(key)) {
          holidayCount += 1
          continue
        }
        scheduledWorkDays += 1
        if (key > todayKey) {
          futureScheduledDays += 1
          continue
        }
        scheduledEvaluatedDays += 1
        switch (classifyDay(recordByDay.get(key), leaveSet.has(key))) {
          case "present":
            presentDays += 1
            break
          case "sick":
            sickDays += 1
            break
          case "leave":
            leaveDays += 1
            break
          case "absent":
            absentDays += 1
            break
          case "halfDay":
            halfDayDays += 1
            break
          case "other":
            otherStatusDays += 1
            break
          case "noRecord":
            noRecordDays += 1
            break
        }
      }
      // Baris pada hari kerja terevaluasi sudah terklasifikasi di atas; baris
      // pada hari libur / non-jadwal / mendatang tidak masuk ember hari,
      // tetapi menitnya sudah terhitung sebagai fakta rekod.
    } else {
      // Tanpa jadwal: ember hari dari rekod apa adanya, tanpa menurunkan
      // hari kerja (BR-ATT-04). Tanpa rekod tidak bisa diturunkan.
      for (const [key, record] of recordByDay) {
        switch (classifyDay(record, leaveSet.has(key))) {
          case "present":
            presentDays += 1
            break
          case "sick":
            sickDays += 1
            break
          case "leave":
            leaveDays += 1
            break
          case "absent":
            absentDays += 1
            break
          case "halfDay":
            halfDayDays += 1
            break
          default:
            otherStatusDays += 1
            break
        }
      }
      // Cuti approved tanpa rekod pada karyawan tanpa jadwal tetap fakta.
      for (const key of leaveSet) {
        if (!recordByDay.has(key)) leaveDays += 1
      }
    }

    return {
      employeeId: input.employeeId,
      employeeName: input.employeeName,
      departmentId: input.departmentId,
      departmentName: input.departmentName,
      hasSchedule: input.hasSchedule,
      scheduledWorkDays,
      scheduledEvaluatedDays,
      holidayDays: holidayCount,
      futureScheduledDays,
      presentDays,
      sickDays,
      leaveDays,
      absentDays,
      halfDayDays,
      otherStatusDays,
      noRecordDays,
      lateEventCount,
      totalLateMinutes,
      totalOvertimeMinutes,
      recordCount: recordByDay.size,
    }
  })

  employees.sort((a, b) => {
    const nameA = a.employeeName ?? ""
    const nameB = b.employeeName ?? ""
    if (nameA !== nameB) return nameA < nameB ? -1 : 1
    return a.employeeId - b.employeeId
  })

  const totals = employees.reduce(
    (acc, e) => ({
      employeeCount: acc.employeeCount + 1,
      scheduledEmployeeCount: acc.scheduledEmployeeCount + (e.hasSchedule ? 1 : 0),
      unscheduledEmployeeCount:
        acc.unscheduledEmployeeCount + (e.hasSchedule ? 0 : 1),
      scheduledWorkDays: acc.scheduledWorkDays + (e.scheduledWorkDays ?? 0),
      scheduledEvaluatedDays:
        acc.scheduledEvaluatedDays + (e.scheduledEvaluatedDays ?? 0),
      holidayDays: acc.holidayDays + (e.holidayDays ?? 0),
      futureScheduledDays: acc.futureScheduledDays + (e.futureScheduledDays ?? 0),
      presentDays: acc.presentDays + e.presentDays,
      sickDays: acc.sickDays + e.sickDays,
      leaveDays: acc.leaveDays + e.leaveDays,
      absentDays: acc.absentDays + e.absentDays,
      halfDayDays: acc.halfDayDays + e.halfDayDays,
      otherStatusDays: acc.otherStatusDays + e.otherStatusDays,
      noRecordDays: acc.noRecordDays + (e.noRecordDays ?? 0),
      lateEventCount: acc.lateEventCount + e.lateEventCount,
      totalLateMinutes: acc.totalLateMinutes + e.totalLateMinutes,
      totalOvertimeMinutes: acc.totalOvertimeMinutes + e.totalOvertimeMinutes,
      recordCount: acc.recordCount + e.recordCount,
    }),
    {
      employeeCount: 0,
      scheduledEmployeeCount: 0,
      unscheduledEmployeeCount: 0,
      scheduledWorkDays: 0,
      scheduledEvaluatedDays: 0,
      holidayDays: 0,
      futureScheduledDays: 0,
      presentDays: 0,
      sickDays: 0,
      leaveDays: 0,
      absentDays: 0,
      halfDayDays: 0,
      otherStatusDays: 0,
      noRecordDays: 0,
      lateEventCount: 0,
      totalLateMinutes: 0,
      totalOvertimeMinutes: 0,
      recordCount: 0,
    },
  )

  return { notice: ATTENDANCE_RECAP_NOTICE, employees, totals }
}
