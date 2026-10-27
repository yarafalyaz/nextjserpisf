// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { OvertimeRecapTable } from "../../../_components/overtime-recap-table"
import {
  OVERTIME_RECAP_NOTICE,
  OVERTIME_RECAP_NO_DEPARTMENT_LABEL,
  OVERTIME_RECAP_NO_PROJECT_LABEL,
  OVERTIME_RECAP_VALUE_NOT_CALCULATED_LABEL,
  type OvertimeRecap,
} from "@/lib/reports/overtime-recap"
import {
  renderCard,
  unmountCard,
  clearRenderedCards,
} from "@/components/reports/__tests__/card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

const RECAP: OvertimeRecap = {
  notice: OVERTIME_RECAP_NOTICE,
  employees: [
    {
      employeeId: 7,
      employeeName: "Budi Santoso",
      departmentId: 2,
      departmentName: "Bengkel",
      requestCount: 3,
      submittedHours: 10.5,
      approvedHours: 6,
      pendingHours: 3,
      rejectedHours: 1.5,
      billableHours: 5.5,
      totalHours: 11,
      mealHours: 2,
      pendingCount: 1,
      approvedCount: 2,
      rejectedCount: 1,
      oldestPendingDate: new Date("2026-10-03T00:00:00"),
      oldestPendingCreatedAt: new Date("2026-10-04T00:00:00"),
      approvedValueMissingCount: 1,
    },
    {
      employeeId: 9,
      employeeName: null,
      departmentId: null,
      departmentName: null,
      requestCount: 1,
      submittedHours: 2,
      approvedHours: 2,
      pendingHours: 0,
      rejectedHours: 0,
      billableHours: 2,
      totalHours: 2,
      mealHours: 0,
      pendingCount: 0,
      approvedCount: 1,
      rejectedCount: 0,
      oldestPendingDate: null,
      oldestPendingCreatedAt: null,
      approvedValueMissingCount: 0,
    },
  ],
  projects: [
    {
      projectId: 11,
      projectName: "Proyek Alpha",
      label: "Proyek Alpha",
      requestCount: 2,
      submittedHours: 8.5,
      approvedHours: 6,
      pendingHours: 2.5,
      rejectedHours: 0,
      billableHours: 5.5,
    },
    {
      projectId: null,
      projectName: null,
      label: OVERTIME_RECAP_NO_PROJECT_LABEL,
      requestCount: 2,
      submittedHours: 4,
      approvedHours: 2,
      pendingHours: 0.5,
      rejectedHours: 1.5,
      billableHours: 2,
    },
  ],
  totals: {
    requestCount: 4,
    submittedHours: 12.5,
    approvedHours: 8,
    pendingHours: 3,
    rejectedHours: 1.5,
    billableHours: 7.5,
    totalHours: 13,
    mealHours: 2,
    pendingCount: 1,
    approvedCount: 3,
    rejectedCount: 1,
    approvedValueMissingCount: 1,
    employeeCount: 2,
  },
}

describe("OvertimeRecapTable F-2026-10-25-016-S", () => {
  it("menampilkan notice, jam, total server, ember tanpa proyek/departemen, label nilai belum dihitung verbatim", () => {
    const { container, root } = renderCard(<OvertimeRecapTable recap={RECAP} />)
    const text = container.textContent ?? ""

    expect(container.querySelector('[aria-label="Rekap lembur per karyawan"]')).not.toBeNull()
    expect(text).toContain(OVERTIME_RECAP_NOTICE)
    expect(text).toContain("Budi Santoso")
    expect(text).toContain("Karyawan #9")
    expect(text).toContain(OVERTIME_RECAP_NO_DEPARTMENT_LABEL)
    // jam verbatim payload (2 desimal id-ID), bukan hitungan ulang UI
    expect(text).toContain("10,50")
    expect(text).toContain("5,50")
    // total footer = totals server apa adanya
    expect(text).toContain("12,50")
    expect(text).toContain("7,50")
    // pending tertua dari tanggal server
    expect(text).toContain("3 Okt 2026")
    // approved belum terhitung nilai: label server, bukan 0/angka uang
    expect(text).toContain(OVERTIME_RECAP_VALUE_NOT_CALCULATED_LABEL)
    expect(text).toContain("1 pengajuan")
    expect(text).not.toContain("Rp")
    // ember proyek null
    expect(text).toContain(OVERTIME_RECAP_NO_PROJECT_LABEL)
    expect(text).toContain("Proyek Alpha")
    expect(container.querySelectorAll("table")).toHaveLength(2)
    unmountCard(root)
  })

  it("keadaan kosong: pesan jujur tanpa tabel dan tanpa angka palsu", () => {
    const empty: OvertimeRecap = {
      notice: OVERTIME_RECAP_NOTICE,
      employees: [],
      projects: [],
      totals: {
        requestCount: 0,
        submittedHours: 0,
        approvedHours: 0,
        pendingHours: 0,
        rejectedHours: 0,
        billableHours: 0,
        totalHours: 0,
        mealHours: 0,
        pendingCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
        approvedValueMissingCount: 0,
        employeeCount: 0,
      },
    }
    const { container, root } = renderCard(<OvertimeRecapTable recap={empty} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Tidak ada pengajuan lembur pada periode dan filter ini.")
    expect(container.querySelector("table")).toBeNull()
    expect(text).not.toContain(OVERTIME_RECAP_VALUE_NOT_CALCULATED_LABEL)
    unmountCard(root)
  })

  it("tanpa approved belum terhitung: label nilai tidak tampil", () => {
    const clean: OvertimeRecap = {
      ...RECAP,
      employees: RECAP.employees.map((employee) => ({
        ...employee,
        approvedValueMissingCount: 0,
      })),
      totals: { ...RECAP.totals, approvedValueMissingCount: 0 },
    }
    const { container, root } = renderCard(<OvertimeRecapTable recap={clean} />)
    expect(container.textContent ?? "").not.toContain(OVERTIME_RECAP_VALUE_NOT_CALCULATED_LABEL)
    unmountCard(root)
  })
})
