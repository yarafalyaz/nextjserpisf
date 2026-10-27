import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  DISCOUNT_EXPOSURE_NOTICE_TEXT,
  DISCOUNT_EXPOSURE_NO_SELLER_LABEL,
  buildDiscountExposure,
  type DiscountExposureDocInput,
} from "../discount-exposure"

const mocks = vi.hoisted(() => ({
  quotationFindMany: vi.fn(),
  salesOrderFindMany: vi.fn(),
  salesInvoiceFindMany: vi.fn(),
  approvalWorkflowFindMany: vi.fn(),
  quotationUpdate: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    quotation: {
      findMany: (...a: unknown[]) => mocks.quotationFindMany(...a),
      update: (...a: unknown[]) => mocks.quotationUpdate(...a),
    },
    salesOrder: { findMany: (...a: unknown[]) => mocks.salesOrderFindMany(...a) },
    salesInvoice: { findMany: (...a: unknown[]) => mocks.salesInvoiceFindMany(...a) },
    approvalWorkflow: {
      findMany: (...a: unknown[]) => mocks.approvalWorkflowFindMany(...a),
    },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

import {
  DISCOUNT_EXPOSURE_INVOICE_STATUSES,
  DISCOUNT_EXPOSURE_QUOTATION_STATUSES,
  getDiscountExposure,
} from "../discount-exposure-data"

const START = new Date("2026-10-01T00:00:00.000Z")
const END = new Date("2026-10-31T23:59:59.999Z")

function doc(overrides: Partial<DiscountExposureDocInput> = {}): DiscountExposureDocInput {
  return {
    docType: "SALES_INVOICE",
    docId: 1,
    slug: "inv-1",
    documentNo: "INV/2026/001",
    date: new Date("2026-10-10T00:00:00.000Z"),
    status: "posted",
    customerId: 10,
    customerName: "PT Uji",
    salesEmployeeId: 7,
    salesEmployeeName: "Sales Uji",
    subtotal: 1000,
    headerDiscount: 0,
    grandTotal: 1000,
    lines: [{ qty: 1, unitPrice: 1000, discount: 0 }],
    ...overrides,
  }
}

describe("discount-exposure builder (F-2026-10-25-006-S)", () => {
  it("notice + ember penjual verbatim spec §6", () => {
    expect(DISCOUNT_EXPOSURE_NOTICE_TEXT).toBe(
      "Paparan ini baca-saja untuk pengawasan. Label ambang mengikuti konfigurasi persetujuan yang sudah ada; dokumen tidak ditahan oleh laporan ini.",
    )
    expect(DISCOUNT_EXPOSURE_NO_SELLER_LABEL).toBe("Tanpa Penjual Tercatat")
  })

  it("AC-DX-B1: diskon baris 50% + header 0 tampil persenEfektif 50, bukan 0 ala F-100", () => {
    const result = buildDiscountExposure([
      doc({ lines: [{ qty: 2, unitPrice: 500, discount: 500 }], subtotal: 500, grandTotal: 500 }),
    ])
    expect(result.dokumen[0].bruto).toBe(1000)
    expect(result.dokumen[0].diskonBaris).toBe(500)
    expect(result.dokumen[0].diskonEfektif).toBe(500)
    expect(result.dokumen[0].persenEfektif).toBe(50)
  })

  it("diskon header + baris digabung; header tertahan [0, subtotal] (EC-2)", () => {
    const result = buildDiscountExposure([
      doc({
        lines: [{ qty: 1, unitPrice: 1000, discount: 100 }],
        subtotal: 900,
        headerDiscount: 5000,
        grandTotal: 0,
      }),
    ])
    expect(result.dokumen[0].diskonHeader).toBe(900)
    expect(result.dokumen[0].diskonEfektif).toBe(1000)
    expect(result.dokumen[0].persenEfektif).toBe(100)
  })

  it("EC-1: bruto 0 persen 0, tetap tampil", () => {
    const result = buildDiscountExposure([
      doc({ lines: [{ qty: 0, unitPrice: 0, discount: 0 }], subtotal: 0, grandTotal: 0 }),
    ])
    expect(result.dokumen).toHaveLength(1)
    expect(result.dokumen[0].persenEfektif).toBe(0)
  })

  it("AC-DX-B3: tanpa konfigurasi ambang semua TANPA_AMBANG, tanpa label karangan", () => {
    const result = buildDiscountExposure([doc({})], {})
    expect(result.dokumen[0].labelAmbang).toBe("TANPA_AMBANG")
    expect(result.dokumen[0].labelAmbangText).toBe("Tanpa Ambang Terkonfigurasi")
    expect(result.jumlahMelebihiAmbang).toBe(0)
  })

  it("label ambang logika DAN atas ambang terkonfigurasi saja (EC-5)", () => {
    const base = doc({
      lines: [{ qty: 1, unitPrice: 1000, discount: 200 }],
      subtotal: 800,
      grandTotal: 800,
    })
    const persenSaja = buildDiscountExposure([base], {
      SALES_INVOICE: [{ minDiscountPercent: 10, minAmount: null }],
    })
    expect(persenSaja.dokumen[0].labelAmbang).toBe("MELEBIHI_AMBANG")

    const nominalGagal = buildDiscountExposure([base], {
      SALES_INVOICE: [{ minDiscountPercent: 10, minAmount: 99999 }],
    })
    expect(nominalGagal.dokumen[0].labelAmbang).toBe("DI_BAWAH_AMBANG")
    expect(nominalGagal.dokumen[0].labelAmbangText).toBe("Di Bawah Ambang")

    const kosongDiabaikan = buildDiscountExposure([base], {
      SALES_INVOICE: [{ minDiscountPercent: null, minAmount: null }],
    })
    expect(kosongDiabaikan.dokumen[0].labelAmbang).toBe("TANPA_AMBANG")
  })

  it("AC-DX-B4: persen agregat tertimbang nominal, bukan rata-rata persen", () => {
    const result = buildDiscountExposure([
      doc({
        docId: 1,
        documentNo: "INV/2026/001",
        lines: [{ qty: 1, unitPrice: 100, discount: 50 }],
        subtotal: 50,
        grandTotal: 50,
      }),
      doc({
        docId: 2,
        documentNo: "INV/2026/002",
        lines: [{ qty: 1, unitPrice: 900, discount: 90 }],
        subtotal: 810,
        grandTotal: 810,
      }),
    ])
    // Tertimbang: 140/1000 = 14%. Rata-rata sederhana (50+10)/2 = 30% = MERAH.
    expect(result.persenTertimbang).toBe(14)
    expect(result.ringkasan[0].persenTertimbang).toBe(14)
  })

  it("AC-DX-B6: penjual null masuk ember Tanpa Penjual Tercatat", () => {
    const result = buildDiscountExposure([
      doc({ salesEmployeeId: null, salesEmployeeName: null }),
    ])
    expect(result.dokumen[0].penjualLabel).toBe("Tanpa Penjual Tercatat")
    expect(result.ringkasan[0].salesEmployeeId).toBeNull()
    expect(result.ringkasan[0].penjualLabel).toBe("Tanpa Penjual Tercatat")
  })

  it("EC-3: rantai Q->SO->faktur = tiga baris terpisah per jenis, tidak digabung", () => {
    const result = buildDiscountExposure([
      doc({ docType: "QUOTATION", docId: 1, documentNo: "QUO/1" }),
      doc({ docType: "SALES_ORDER", docId: 2, documentNo: "SO/1" }),
      doc({ docType: "SALES_INVOICE", docId: 3, documentNo: "INV/1" }),
    ])
    expect(result.totalDokumen).toBe(3)
    expect(result.ringkasan.map((r) => r.docType)).toEqual([
      "QUOTATION",
      "SALES_ORDER",
      "SALES_INVOICE",
    ])
  })

  it("urutan daftar: persenEfektif terbesar dulu, seri documentNo lalu id", () => {
    const result = buildDiscountExposure([
      doc({ docId: 2, documentNo: "INV/2", lines: [{ qty: 1, unitPrice: 100, discount: 10 }] }),
      doc({ docId: 1, documentNo: "INV/1", lines: [{ qty: 1, unitPrice: 100, discount: 90 }] }),
      doc({ docId: 3, documentNo: "INV/3", lines: [{ qty: 1, unitPrice: 100, discount: 10 }] }),
    ])
    expect(result.dokumen.map((r) => r.docId)).toEqual([1, 2, 3])
  })
})

function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    slug: "inv-1",
    documentNo: "INV/2026/001",
    date: new Date("2026-10-10T00:00:00.000Z"),
    status: "posted",
    customerId: 10,
    salesEmployeeId: 7,
    subtotal: 500,
    discount: 0,
    grandTotal: 500,
    customer: { name: "PT Uji" },
    salesEmployee: { name: "Sales Uji" },
    items: [{ qty: 2, unitPrice: 500, discount: 500 }],
    ...overrides,
  }
}

describe("discount-exposure loader (Q-DX-2/3)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: 1 })
    mocks.quotationFindMany.mockResolvedValue([])
    mocks.salesOrderFindMany.mockResolvedValue([])
    mocks.salesInvoiceFindMany.mockResolvedValue([])
    mocks.approvalWorkflowFindMany.mockResolvedValue([])
  })

  it("izin view_reports ditegakkan fail-closed sebelum query apa pun", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getDiscountExposure({ start: START, end: END })).rejects.toThrow(
      "Tidak memiliki izin",
    )
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_reports")
    expect(mocks.salesInvoiceFindMany).not.toHaveBeenCalled()
  })

  it("AC-DX-B5: saringan populasi Q-DX-3 persis per jenis + deletedAt null + periode", async () => {
    await getDiscountExposure({ start: START, end: END })

    expect(DISCOUNT_EXPOSURE_QUOTATION_STATUSES).toEqual([
      "sent",
      "accepted",
      "approved",
      "converted",
    ])
    expect(DISCOUNT_EXPOSURE_INVOICE_STATUSES).toEqual([
      "posted",
      "partial",
      "paid",
      "approved",
      "sent",
    ])
    expect(mocks.quotationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["sent", "accepted", "approved", "converted"] },
          deletedAt: null,
          date: { gte: START, lte: END },
        }),
      }),
    )
    expect(mocks.salesOrderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["approved", "confirmed", "processing", "completed"] },
          deletedAt: null,
        }),
      }),
    )
    expect(mocks.salesInvoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["posted", "partial", "paid", "approved", "sent"] },
          deletedAt: null,
        }),
      }),
    )
  })

  it("AC-DX-B2: faktur langsung tanpa quotation/SO tetap masuk populasi", async () => {
    mocks.salesInvoiceFindMany.mockResolvedValue([invoiceRow()])
    const result = await getDiscountExposure({ start: START, end: END })
    expect(result.dokumen).toHaveLength(1)
    expect(result.dokumen[0].docType).toBe("SALES_INVOICE")
    expect(result.dokumen[0].persenEfektif).toBe(50)
  })

  it("ambang dari workflow prioritas tertinggi per modelType; conditions korup diabaikan", async () => {
    mocks.salesInvoiceFindMany.mockResolvedValue([invoiceRow()])
    mocks.approvalWorkflowFindMany.mockResolvedValue([
      {
        modelType: "SalesInvoice",
        steps: [{ conditions: { minDiscountPercent: 10 } }],
      },
      {
        modelType: "SalesInvoice",
        steps: [{ conditions: { minDiscountPercent: 99 } }],
      },
    ])
    const result = await getDiscountExposure({ start: START, end: END })
    // Workflow pertama (prioritas tertinggi dari order query) yang dipakai.
    expect(result.dokumen[0].labelAmbang).toBe("MELEBIHI_AMBANG")
    expect(result.jumlahMelebihiAmbang).toBe(1)
  })

  it("AC-DX-B7: dua panggilan identik, nol mutasi", async () => {
    mocks.salesInvoiceFindMany.mockResolvedValue([invoiceRow()])
    const first = await getDiscountExposure({ start: START, end: END })
    const second = await getDiscountExposure({ start: START, end: END })
    expect(second).toEqual(first)
    expect(mocks.quotationUpdate).not.toHaveBeenCalled()
  })
})
