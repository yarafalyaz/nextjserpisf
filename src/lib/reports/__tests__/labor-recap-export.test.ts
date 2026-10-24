// @vitest-environment jsdom
// (tanpa jsdom sebenarnya — builder + tabel PDF murni; konsisten dgn tes kartu)
import { describe, it, expect, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  prismaMock: {
    productionCost: { findMany: vi.fn().mockResolvedValue([]) },
    timesheet: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import {
  buildLaborRecapTable,
  loadLaborRecapReport,
} from "@/lib/reports/labor-recap-export"

describe("buildLaborRecapTable (F-2026-10-20-97a)", () => {
  it("tabel PDF memuat teknisi, kelompok tanpa teknisi, total, dan notice", () => {
    const table = buildLaborRecapTable({
      report: {
        notice: "Rekap informatif — bukan dasar pembayaran.",
        technicians: [
          { employeeId: 7, employeeName: "Budi", laborHours: 12, totalAmount: 750_000, lineCount: 2 },
        ],
        unattributed: { laborHours: 2, totalAmount: 100_000, lineCount: 1 },
        undated: { laborHours: 0, totalAmount: 0, lineCount: 0 },
        totalLaborHours: 14,
        totalAmount: 850_000,
        totalLineCount: 3,
      },
    })
    const text = JSON.stringify(table)
    expect(text).toContain("Rekap Borongan per Teknisi")
    expect(text).toContain("Budi")
    expect(text).toContain("Tanpa teknisi (baris manual)")
    expect(text).toContain("Total")
    expect(text).toContain("bukan dasar pembayaran")
    expect(text).not.toContain("Bayar")
    expect(table.columns).toHaveLength(4)
  })

  it("keadaan kosong tampil catatan jujur, bukan tabel angka nol", () => {
    const table = buildLaborRecapTable({
      report: {
        notice: "Rekap informatif.",
        technicians: [],
        unattributed: { laborHours: 0, totalAmount: 0, lineCount: 0 },
        undated: { laborHours: 0, totalAmount: 0, lineCount: 0 },
        totalLaborHours: 0,
        totalAmount: 0,
        totalLineCount: 0,
      },
    })
    const text = JSON.stringify(table)
    expect(text).toContain("Belum ada baris biaya labor")
    expect(table.rows.some((row) => row.kind === "data")).toBe(false)
  })

  it("loader memakai getLaborRecap tanpa hitung ulang", async () => {
    const result = await loadLaborRecapReport()
    expect(result.report.totalLineCount).toBe(0)
    expect(result.report.notice).toContain("bukan dasar pembayaran")
  })
})
