import { describe, it, expect, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  prismaMock: {
    quotation: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import {
  buildQuotationOutcomeTable,
  loadQuotationOutcomeReport,
  type QuotationOutcomeLoadResult,
} from "@/lib/reports/quotation-outcome-export"
import type { TableDocument } from "@/lib/pdf/engine/types"

describe("buildQuotationOutcomeTable (F-2026-10-20-101)", () => {
  it("tabel PDF memuat ringkasan dan kategori kalah", () => {
    const table = buildQuotationOutcomeTable(fixture())
    const text = JSON.stringify(table)
    expect(text).toContain("Ringkasan Hasil Penawaran")
    expect(text).toContain("Tingkat menang")
    expect(text).toContain("Harga terlalu tinggi")
    expect(text).toContain("Tidak tercatat (penolakan lama)")
    expect(table.columns).toHaveLength(2)
    // Kolom hitung berlabel entitasnya (AC-REP-003), bukan "Jumlah" ambigu.
    expect(table.columns.map((column) => column.header)).toEqual(["Kategori Kalah", "Penawaran"])
  })

  it("keadaan kosong tampil catatan jujur, bukan tabel angka nol", () => {
    const table = buildQuotationOutcomeTable(emptyFixture())
    const text = JSON.stringify(table)
    expect(text).toContain("Belum ada penawaran pada periode ini")
    expect(table.rows.some((row) => row.kind === "data")).toBe(false)
  })

  it("loader: caption rentang periode terbaca", async () => {
    const result = await loadQuotationOutcomeReport({
      start: new Date("2026-10-01T00:00:00Z"),
      end: new Date("2026-10-20T00:00:00Z"),
    })
    expect(result.periodCaption).toContain("1 Oktober 2026")
    expect(result.periodCaption).toContain("20 Oktober 2026")
    expect(result.report.totalQuotations).toBe(0)
  })
})

type Fixture = QuotationOutcomeLoadResult

function fixture(): Fixture {
  return {
    periodCaption: "1 Oktober 2026 – 20 Oktober 2026",
    report: {
      totalQuotations: 5,
      accepted: 2,
      rejected: 2,
      converted: 1,
      winRate: 0.5,
      conversionRate: 0.5,
      lostByCategory: [
        { key: "harga", label: "Harga terlalu tinggi", count: 1 },
        { key: "tak-tercatat", label: "Tidak tercatat (penolakan lama)", count: 1 },
      ],
    },
  }
}

function emptyFixture(): Fixture {
  return {
    periodCaption: "1 Oktober 2026 – 20 Oktober 2026",
    report: {
      totalQuotations: 0,
      accepted: 0,
      rejected: 0,
      converted: 0,
      winRate: null,
      conversionRate: null,
      lostByCategory: [],
    },
  }
}

// TableDocument dipakai agar fixture tetap terikat kontrak PDF.
export type _TableContract = TableDocument["table"]
