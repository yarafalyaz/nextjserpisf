// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { AttendanceRecapTable } from "../../../_components/attendance-recap-table"
import {
  buildAttendanceRecap,
  ATTENDANCE_RECAP_NOTICE,
  type AttendanceRecap,
  type AttendanceRecapEmployeeInput,
} from "@/lib/reports/attendance-recap"
import {
  renderCard,
  unmountCard,
  clearRenderedCards,
} from "@/components/reports/__tests__/card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

const TODAY = new Date("2026-10-26T00:00:00")

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

function recapFixture(): AttendanceRecap {
  const inputs: AttendanceRecapEmployeeInput[] = [
    {
      employeeId: 7,
      employeeName: "Budi Santoso",
      departmentId: 2,
      departmentName: "Bengkel",
      hasSchedule: true,
      scheduledDays: [day("2026-10-19"), day("2026-10-20"), day("2026-10-21"), day("2026-10-22")],
      holidayDays: [],
      records: [
        { date: day("2026-10-19"), status: "present", hasCheckIn: true, lateMinutes: 0, overtimeMinutes: null },
        { date: day("2026-10-20"), status: "present", hasCheckIn: true, lateMinutes: 15, overtimeMinutes: 30 },
        { date: day("2026-10-21"), status: "sick", hasCheckIn: true, lateMinutes: 0, overtimeMinutes: null },
      ],
      approvedLeaveDays: [],
    },
    {
      employeeId: 9,
      employeeName: null,
      departmentId: null,
      departmentName: null,
      hasSchedule: false,
      scheduledDays: [],
      holidayDays: [],
      records: [
        { date: day("2026-10-20"), status: "present", hasCheckIn: true, lateMinutes: 0, overtimeMinutes: null },
      ],
      approvedLeaveDays: [],
    },
  ]
  return buildAttendanceRecap(inputs, TODAY)
}

describe("AttendanceRecapTable F-2026-10-25-044-S", () => {
  it("notice verbatim + ember builder persis; tanpa jadwal berlabel, bukan 0", () => {
    const { container, root } = renderCard(<AttendanceRecapTable recap={recapFixture()} />)
    const text = container.textContent ?? ""
    expect(text).toContain(ATTENDANCE_RECAP_NOTICE)
    // Penjaga literal: ubah string builder ATTENDANCE_RECAP_NOTICE = MERAH.
    expect(text).toContain(
      "Rekap kehadiran operasional — bukan dasar potongan gaji. Ember mengikuti klasifikasi status rekod; angka potongan payroll memakai definisi check-in service payroll sehingga jumlah hadir/alpa rekap dapat berbeda dari dasar potongan slip untuk orang dan periode yang sama. Tanpa rekod bukan alpa: hari kerja tanpa rekod kehadiran dan tanpa cuti disetujui ditampilkan terpisah dari alpa tercatat.",
    )
    expect(text).toContain("Budi Santoso")
    expect(text).toContain("Bengkel")
    // Asersi per sel: Budi hadir 2, sakit 1 (sick ber-checkIn tetap sakit,
    // EC-1), tanpa rekod 1 (22 Okt). Urutan sel mengikuti urutan kolom.
    // Builder mengurutkan nama (null paling depan): pilih baris Budi.
    const budiRow = Array.from(container.querySelectorAll("tbody tr")).find((row) =>
      (row.textContent ?? "").includes("Budi Santoso"),
    )
    const cells = Array.from(budiRow?.querySelectorAll("td") ?? []).map((cell) => cell.textContent)
    expect(cells.slice(2, 11)).toEqual(["4", "4", "2", "1", "0", "0", "0", "0", "1"])
    expect(text).toContain("Karyawan #9")
    expect(text).toContain("Tanpa jadwal")
    expect(text).toContain("Tanpa departemen")
    // Nol nominal uang di permukaan rekap (BR-ATT-05).
    expect(text).not.toContain("Rp")
    unmountCard(root)
  })

  it("kosong: pesan jujur, tanpa tabel karyawan", () => {
    const recap = buildAttendanceRecap([], TODAY)
    const { container, root } = renderCard(<AttendanceRecapTable recap={recap} />)
    const text = container.textContent ?? ""
    expect(text).toContain(ATTENDANCE_RECAP_NOTICE)
    expect(text).toContain("Tidak ada karyawan dalam cakupan pada periode dan filter ini.")
    expect(container.querySelector("[data-report-table]")).toBeNull()
    unmountCard(root)
  })
})
