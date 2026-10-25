import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: vi.fn() }))

import {
  DISCOUNT_EXPOSURE_NOTICE_TEXT,
  DISCOUNT_EXPOSURE_NO_SELLER_LABEL,
  type DiscountExposure,
} from "@/lib/reports/discount-exposure"
import {
  buildDiscountExposureTable,
  type DiscountExposureLoadResult,
} from "@/lib/reports/discount-exposure-export"

describe("buildDiscountExposureTable (F-2026-10-25-006-S AC-DX-F1)", () => {
  it("angka, persen, label verbatim payload server — tanpa hitung ulang", () => {
    const table = buildDiscountExposureTable(fixture())
    const text = JSON.stringify(table)
    expect(text).toContain("INV-2026-001")
    expect(text).toContain(DISCOUNT_EXPOSURE_NO_SELLER_LABEL)
    expect(text).toContain("Melebihi Ambang")
    expect(text).toContain("Tanpa Ambang Terkonfigurasi")
    expect(text).toContain("12,50%")
    expect(text).toContain(DISCOUNT_EXPOSURE_NOTICE_TEXT)
    const total = table.rows.find((row) => row.kind === "total")
    expect(total?.kind === "total" && total.cells.join(" ")).toContain("2 dokumen")
    expect(total?.kind === "total" && total.cells.join(" ")).toContain("1 melebihi ambang")
  })

  it("kosong: notice jujur, tanpa baris data/total", () => {
    const empty: DiscountExposure = {
      dokumen: [],
      ringkasan: [],
      totalDokumen: 0,
      totalBruto: 0,
      totalDiskonEfektif: 0,
      persenTertimbang: 0,
      jumlahMelebihiAmbang: 0,
    }
    const table = buildDiscountExposureTable({ exposure: empty, periodCaption: "Oktober 2026" })
    const text = JSON.stringify(table)
    expect(text).toContain("Tidak ada dokumen penjualan pada periode ini.")
    expect(text).toContain(DISCOUNT_EXPOSURE_NOTICE_TEXT)
    expect(table.rows.some((row) => row.kind === "data")).toBe(false)
    expect(table.rows.some((row) => row.kind === "total")).toBe(false)
  })
})

function fixture(): DiscountExposureLoadResult {
  const exposure: DiscountExposure = {
    dokumen: [
      {
        docType: "SALES_INVOICE",
        docId: 1,
        slug: "inv-2026-001",
        documentNo: "INV-2026-001",
        date: new Date("2026-10-10T00:00:00"),
        status: "posted",
        customerId: 1,
        customerName: "PT Contoh",
        salesEmployeeId: null,
        salesEmployeeName: null,
        subtotal: 875_000,
        headerDiscount: 0,
        grandTotal: 875_000,
        lines: [],
        bruto: 1_000_000,
        diskonBaris: 100_000,
        diskonHeader: 25_000,
        diskonEfektif: 125_000,
        persenEfektif: 12.5,
        labelAmbang: "MELEBIHI_AMBANG",
        labelAmbangText: "Melebihi Ambang",
        penjualLabel: DISCOUNT_EXPOSURE_NO_SELLER_LABEL,
      },
      {
        docType: "QUOTATION",
        docId: 2,
        slug: "quo-2026-002",
        documentNo: "QUO-2026-002",
        date: new Date("2026-10-11T00:00:00"),
        status: "sent",
        customerId: 2,
        customerName: "CV Uji",
        salesEmployeeId: 7,
        salesEmployeeName: "Budi",
        subtotal: 500_000,
        headerDiscount: 0,
        grandTotal: 500_000,
        lines: [],
        bruto: 500_000,
        diskonBaris: 0,
        diskonHeader: 0,
        diskonEfektif: 0,
        persenEfektif: 0,
        labelAmbang: "TANPA_AMBANG",
        labelAmbangText: "Tanpa Ambang Terkonfigurasi",
        penjualLabel: "Budi",
      },
    ],
    ringkasan: [],
    totalDokumen: 2,
    totalBruto: 1_500_000,
    totalDiskonEfektif: 125_000,
    persenTertimbang: 8.33,
    jumlahMelebihiAmbang: 1,
  }
  return { exposure, periodCaption: "1 Oktober 2026 – 31 Oktober 2026" }
}
