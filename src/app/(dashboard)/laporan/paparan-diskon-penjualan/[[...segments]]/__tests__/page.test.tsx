// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { act } from "react"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  loadDiscountExposureReport: vi.fn(),
  buildDiscountExposureTable: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
}))

vi.mock("@/lib/reports/discount-exposure-export", () => ({
  loadDiscountExposureReport: mocks.loadDiscountExposureReport,
  buildDiscountExposureTable: mocks.buildDiscountExposureTable,
}))

vi.mock("@/components/reports/report-page-shell", async () =>
  (await import("@/components/reports/__tests__/card-test-utils")).reportPageShellModule,
)

vi.mock("@/components/reports/report-period-filter", () => ({
  ReportPeriodFilter: () => null,
}))

vi.mock("@/components/reports/export-buttons", () => ({
  ExportButtons: () => null,
}))

import DiscountExposurePage from "../page"
import {
  DISCOUNT_EXPOSURE_NOTICE_TEXT,
  DISCOUNT_EXPOSURE_NO_SELLER_LABEL,
  type DiscountExposure,
} from "@/lib/reports/discount-exposure"
import { renderPageNode, unmountCard } from "@/components/reports/__tests__/card-test-utils"

const EXPOSURE: DiscountExposure = {
  dokumen: [
    {
      docType: "SALES_INVOICE",
      docId: 1,
      slug: "inv-2026-001",
      documentNo: "INV-2026-001",
      date: new Date("2026-10-10T00:00:00Z"),
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
  ],
  ringkasan: [],
  totalDokumen: 1,
  totalBruto: 1_000_000,
  totalDiskonEfektif: 125_000,
  persenTertimbang: 12.5,
  jumlahMelebihiAmbang: 1,
}

async function renderPage() {
  const node = await DiscountExposurePage({
    params: Promise.resolve({ segments: [] }),
    searchParams: Promise.resolve({}),
  })
  return renderPageNode(node)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ name: "Admin", email: "admin@example.id" })
  mocks.loadDiscountExposureReport.mockResolvedValue({
    exposure: EXPOSURE,
    periodCaption: "1 Oktober 2026 – 31 Oktober 2026",
  })
})

afterEach(() => {
  document.body.replaceChildren()
})

describe("F-2026-10-25-006-S halaman Paparan Diskon Penjualan (AC-DX-F1/F2)", () => {
  it("gerbang view_reports + angka/label/notice verbatim payload server", async () => {
    const { container, root } = await renderPage()
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_reports")
    expect(mocks.loadDiscountExposureReport).toHaveBeenCalledTimes(1)
    const text = container.textContent ?? ""
    expect(text).toContain("Paparan Diskon Penjualan")
    expect(text).toContain(DISCOUNT_EXPOSURE_NOTICE_TEXT)
    expect(text).toContain("INV-2026-001")
    expect(text).toContain(DISCOUNT_EXPOSURE_NO_SELLER_LABEL)
    expect(text).toContain("Melebihi Ambang")
    expect(text).toContain("12,50%")
    unmountCard(root)
  })

  it("tanpa izin lihat loader tidak dipanggil (AC-DX-F2)", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("redirect:/"))
    await expect(
      DiscountExposurePage({
        params: Promise.resolve({ segments: [] }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("redirect:/")
    expect(mocks.loadDiscountExposureReport).not.toHaveBeenCalled()
  })

  it("kosong: teks kosong jujur tampil, tanpa baris dokumen", async () => {
    mocks.loadDiscountExposureReport.mockResolvedValue({
      exposure: { ...EXPOSURE, dokumen: [], totalDokumen: 0, jumlahMelebihiAmbang: 0 },
      periodCaption: "Oktober 2026",
    })
    const { container, root } = await renderPage()
    const text = container.textContent ?? ""
    expect(text).toContain("Tidak ada dokumen penjualan pada periode ini.")
    expect(text).not.toContain("INV-2026-001")
    unmountCard(root)
    act(() => {})
  })
})
