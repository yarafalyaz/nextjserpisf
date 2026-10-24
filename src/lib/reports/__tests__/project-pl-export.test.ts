import { describe, it, expect, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  prismaMock: {
    project: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    workOrder: { findMany: vi.fn().mockResolvedValue([]) },
    salesInvoice: { findMany: vi.fn().mockResolvedValue([]) },
    materialIssue: { findMany: vi.fn().mockResolvedValue([]) },
    productionCost: { findMany: vi.fn().mockResolvedValue([]) },
    expense: { findMany: vi.fn().mockResolvedValue([]) },
    pettyCash: { findMany: vi.fn().mockResolvedValue([]) },
    vendorBill: { findMany: vi.fn().mockResolvedValue([]) },
    timesheet: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import {
  buildProjectPlTable,
  loadProjectPlPdfReport,
  type ProjectPlLoadResult,
} from "../project-pl-export"
import type { ProjectPlReport } from "../project-pl-data"
import {
  projectPlBase,
  projectPlRow,
  projectPlWithCost,
} from "@/components/reports/__tests__/project-pl-test-fixtures"
import { buildProjectPl } from "../project-pl"

function result(rows: ProjectPlReport["rows"]): ProjectPlLoadResult {
  return {
    report: { rows, periodLabel: "Periode ini", periodCaption: "Periode 1 Jan 2026 – 21 Okt 2026" },
    periodCaption: "Periode 1 Jan 2026 – 21 Okt 2026",
  }
}

describe("buildProjectPlTable (ekspor L-R proyek)", () => {
  it("angka PDF persis baris builder kartu: pendapatan 20jt, biaya produksi 5jt, laba 15jt", () => {
    const table = buildProjectPlTable(result([projectPlRow(projectPlWithCost())]))
    const text = JSON.stringify(table)
    expect(table.columns).toHaveLength(12)
    const dataRows = table.rows.filter((row) => row.kind === "data")
    expect(dataRows).toHaveLength(1)
    expect(dataRows[0]).toMatchObject({
      cells: expect.arrayContaining(["Restorasi Kijang", "20.000.000", "5.000.000", "15.000.000", "75.0%"]),
    })
    const totalRow = table.rows.find((row) => row.kind === "total")
    expect(totalRow).toMatchObject({ label: "TOTAL", grand: true })
    expect(JSON.stringify(totalRow)).toContain("20.000.000")
    expect(text).not.toContain("40.000.000")
    // timesheet #7 sudah ditarik -> tidak ada grup memo
    expect(text).not.toContain("Memo Jam Timesheet Belum Ditarik")
  })

  it("memo jam belum ditarik tampil sebagai notice, bukan biaya", () => {
    const pl = buildProjectPl(projectPlBase({ timesheets: [{ id: 9, projectId: 1, hours: 12.5 }] }))
    const table = buildProjectPlTable(result([projectPlRow(pl)]))
    const text = JSON.stringify(table)
    expect(text).toContain("Memo Jam Timesheet Belum Ditarik")
    expect(text).toContain("bukan biaya dan tidak mengurangi laba")
    expect(text).toContain("12,50 jam")
  })

  it("keadaan kosong tampil catatan, bukan baris data", () => {
    const table = buildProjectPlTable(result([]))
    expect(JSON.stringify(table)).toContain("Tidak ada proyek dalam periode ini")
    expect(table.rows.some((row) => row.kind === "data")).toBe(false)
  })

  it("loader PDF memakai loadProjectPlReport yang sama dengan halaman", async () => {
    const loaded = await loadProjectPlPdfReport({
      start: new Date("2026-01-01T00:00:00"),
      end: new Date("2026-10-21T23:59:59"),
    })
    expect(loaded.report.rows).toEqual([])
    expect(loaded.periodCaption).toBe(loaded.report.periodCaption)
    expect(mocks.prismaMock.salesInvoice.findMany).toHaveBeenCalled()
  })
})
