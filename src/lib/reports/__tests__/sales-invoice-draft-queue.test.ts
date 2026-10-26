import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  SALES_INVOICE_DRAFT_LEVEL_LABELS,
  SALES_INVOICE_DRAFT_NOTICE_TEXT,
  SALES_INVOICE_DRAFT_NO_DUE_DATE_TEXT,
  SALES_INVOICE_DRAFT_STALE_DAYS,
  SALES_INVOICE_DRAFT_TOTAL_LABEL,
  buildSalesInvoiceDraftQueue,
  deriveSalesInvoiceDraftLevel,
  salesInvoiceDraftAgeDays,
  salesInvoiceDraftSourceLabel,
  summarizeSalesInvoiceDraftQueue,
  type SalesInvoiceDraftInput,
} from "../sales-invoice-draft-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const mocks = vi.hoisted(() => ({
  salesInvoiceFindMany: vi.fn(),
  employeeFindMany: vi.fn(),
  salesOrderFindMany: vi.fn(),
  quotationFindMany: vi.fn(),
  salesInvoiceUpdate: vi.fn(),
  salesInvoiceCreate: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    salesInvoice: {
      findMany: (...a: unknown[]) => mocks.salesInvoiceFindMany(...a),
      update: (...a: unknown[]) => mocks.salesInvoiceUpdate(...a),
      create: (...a: unknown[]) => mocks.salesInvoiceCreate(...a),
    },
    employee: { findMany: (...a: unknown[]) => mocks.employeeFindMany(...a) },
    salesOrder: { findMany: (...a: unknown[]) => mocks.salesOrderFindMany(...a) },
    quotation: { findMany: (...a: unknown[]) => mocks.quotationFindMany(...a) },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

import { getSalesInvoiceDraftQueue } from "../sales-invoice-draft-queue-data"

// Hari kalender WIB tetap: 2026-10-26 — instan 05:00 WIB.
const NOW = new Date("2026-10-25T22:00:00.000Z")
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function input(overrides: Partial<SalesInvoiceDraftInput> = {}): SalesInvoiceDraftInput {
  return {
    invoiceId: 1,
    slug: "inv-1",
    documentNo: "INV/2026/001",
    status: "draft",
    deletedAt: null,
    customerId: 10,
    customerName: "PT Uji",
    salesEmployeeId: 7,
    salesEmployeeName: "Sales Uji",
    salesOrderId: null,
    salesOrderNo: null,
    quotationId: null,
    quotationNo: null,
    projectId: null,
    date: day(-4),
    dueDate: day(10),
    createdAt: day(-4),
    grandTotal: 2000,
    ...overrides,
  }
}

describe("buildSalesInvoiceDraftQueue (builder murni, F-2026-10-26-057-S)", () => {
  it("konstanta ambang + label + notice + label rekap verbatim putusan Q-SIQ-1/2", () => {
    expect(SALES_INVOICE_DRAFT_STALE_DAYS).toBe(3)
    expect(SALES_INVOICE_DRAFT_LEVEL_LABELS).toEqual({
      mengendap: "Mengendap",
      menunggu: "Menunggu Posting",
    })
    expect(SALES_INVOICE_DRAFT_NOTICE_TEXT).toBe(
      "Daftar ini hanya faktur penjualan yang masih draft dan belum diposting. Draft belum menjadi tagihan dan belum dihitung sebagai piutang sampai diposting lewat detail faktur.",
    )
    expect(SALES_INVOICE_DRAFT_TOTAL_LABEL).toBe("nilai draft belum terbit")
    expect(SALES_INVOICE_DRAFT_NO_DUE_DATE_TEXT).toBe("Jatuh tempo belum diisi")
  })

  it("AC-SIQ-B1: posted/partial/paid/cancelled/approved/sent/terhapus tidak pernah masuk", () => {
    const rows = buildSalesInvoiceDraftQueue(
      [
        input({ invoiceId: 1, status: "posted" }),
        input({ invoiceId: 2, status: "partial" }),
        input({ invoiceId: 3, status: "paid" }),
        input({ invoiceId: 4, status: "cancelled" }),
        input({ invoiceId: 5, status: "approved" }),
        input({ invoiceId: 6, status: "sent" }),
        input({ invoiceId: 7, deletedAt: day(-1) }),
        input({ invoiceId: 8 }),
      ],
      NOW,
    )
    expect(rows.map((r) => r.invoiceId)).toEqual([8])
  })

  it("AC-SIQ-B2: umur dari createdAt; tepat ambang 3 = mengendap; 2 = menunggu; hari sama 0", () => {
    expect(salesInvoiceDraftAgeDays(day(0), TODAY)).toBe(0)
    expect(salesInvoiceDraftAgeDays(day(-3), TODAY)).toBe(3)
    expect(deriveSalesInvoiceDraftLevel(3)).toBe("mengendap")
    expect(deriveSalesInvoiceDraftLevel(2)).toBe("menunggu")
    const rows = buildSalesInvoiceDraftQueue(
      [input({ invoiceId: 1, createdAt: day(-3) }), input({ invoiceId: 2, createdAt: day(-2) })],
      NOW,
    )
    expect(rows.find((r) => r.invoiceId === 1)?.tingkat).toBe("mengendap")
    expect(rows.find((r) => r.invoiceId === 2)?.tingkat).toBe("menunggu")
  })

  it("EC-SIQ-4: createdAt masa depan umur 0 bukan negatif", () => {
    expect(salesInvoiceDraftAgeDays(day(2), TODAY)).toBe(0)
    const [row] = buildSalesInvoiceDraftQueue([input({ createdAt: day(2) })], NOW)
    expect(row.umurDraftHari).toBe(0)
    expect(row.tingkat).toBe("menunggu")
  })

  it("BR-SIQ-04: dueDate lampau pada draft bukan kelewatan — tingkat tetap dari umur, tanpa label piutang", () => {
    const [row] = buildSalesInvoiceDraftQueue(
      [input({ dueDate: day(-30), createdAt: day(-1) })],
      NOW,
    )
    expect(row.tingkat).toBe("menunggu")
    expect(row.punyaRencanaJatuhTempo).toBe(true)
    const [noDue] = buildSalesInvoiceDraftQueue([input({ dueDate: null })], NOW)
    expect(noDue.punyaRencanaJatuhTempo).toBe(false)
  })

  it("Q-SIQ-3b: urutan mengendap dulu lalu umur tertua; seri documentNo asc", () => {
    const rows = buildSalesInvoiceDraftQueue(
      [
        input({ invoiceId: 1, documentNo: "INV/B", createdAt: day(-1) }),
        input({ invoiceId: 2, documentNo: "INV/C", createdAt: day(-10) }),
        input({ invoiceId: 3, documentNo: "INV/A", createdAt: day(-5) }),
        input({ invoiceId: 4, documentNo: "INV/D", createdAt: day(-2) }),
      ],
      NOW,
    )
    expect(rows.map((r) => r.invoiceId)).toEqual([2, 3, 4, 1])
  })

  it("BR-SIQ-09: sumber urut SO -> penawaran -> proyek -> langsung, satu label", () => {
    expect(
      salesInvoiceDraftSourceLabel({ salesOrderNo: "SO/1", quotationNo: "QUO/1", projectId: 9 }),
    ).toBe("Dari Pesanan SO/1")
    expect(
      salesInvoiceDraftSourceLabel({ salesOrderNo: null, quotationNo: "QUO/1", projectId: 9 }),
    ).toBe("Dari Penawaran QUO/1")
    expect(
      salesInvoiceDraftSourceLabel({ salesOrderNo: null, quotationNo: null, projectId: 9 }),
    ).toBe("Proyek")
    expect(
      salesInvoiceDraftSourceLabel({ salesOrderNo: null, quotationNo: null, projectId: null }),
    ).toBe("Langsung")
  })

  it("AC-SIQ-B5: rekap = hitungan + Σ grandTotal baris yang sama; grandTotal 0 tampil (EC-SIQ-6)", () => {
    const rows = buildSalesInvoiceDraftQueue(
      [
        input({ invoiceId: 1, createdAt: day(-5), grandTotal: 2000 }),
        input({ invoiceId: 2, createdAt: day(-1), grandTotal: 0 }),
        input({ invoiceId: 3, createdAt: day(-1), grandTotal: 500 }),
      ],
      NOW,
    )
    expect(rows).toHaveLength(3)
    expect(summarizeSalesInvoiceDraftQueue(rows)).toEqual({
      totalDocuments: 3,
      mengendapCount: 1,
      menungguCount: 2,
      totalGrandTotal: 2500,
      totalLabel: "nilai draft belum terbit",
    })
  })
})

describe("getSalesInvoiceDraftQueue (loader fail-closed)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue(undefined)
    mocks.salesInvoiceFindMany.mockResolvedValue([])
    mocks.employeeFindMany.mockResolvedValue([])
    mocks.salesOrderFindMany.mockResolvedValue([])
    mocks.quotationFindMany.mockResolvedValue([])
  })

  it("AC-SIQ-B4: tanpa izin loader menolak sebelum query apa pun", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getSalesInvoiceDraftQueue(NOW)).rejects.toThrow("Tidak memiliki izin")
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_sales_invoices")
    expect(mocks.salesInvoiceFindMany).not.toHaveBeenCalled()
  })

  it("AC-SIQ-B1/B4: query draft persis; penjual+nomor sumber massal anti-N+1; baca-saja", async () => {
    mocks.salesInvoiceFindMany.mockResolvedValue([
      {
        id: 1,
        slug: "inv-1",
        documentNo: "INV/2026/001",
        status: "draft",
        deletedAt: null,
        customerId: 10,
        salesEmployeeId: 7,
        salesOrderId: 21,
        quotationId: null,
        projectId: null,
        date: day(-4),
        dueDate: day(-30),
        createdAt: day(-4),
        grandTotal: 2000,
        customer: { name: "PT Uji" },
      },
      {
        id: 2,
        slug: null,
        documentNo: "INV/2026/002",
        status: "draft",
        deletedAt: null,
        customerId: 11,
        salesEmployeeId: null,
        salesOrderId: null,
        quotationId: null,
        projectId: null,
        date: day(-1),
        dueDate: null,
        createdAt: day(-1),
        grandTotal: 0,
        customer: { name: "PT Lain" },
      },
    ])
    mocks.employeeFindMany.mockResolvedValue([{ id: 7, name: "Sales Uji" }])
    mocks.salesOrderFindMany.mockResolvedValue([{ id: 21, documentNo: "SO/2026/021" }])

    const queue = await getSalesInvoiceDraftQueue(NOW)

    expect(mocks.salesInvoiceFindMany).toHaveBeenCalledTimes(1)
    const arg = mocks.salesInvoiceFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({ status: "draft", deletedAt: null })
    expect(mocks.employeeFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.employeeFindMany.mock.calls[0][0].where).toEqual({ id: { in: [7] } })
    expect(mocks.salesOrderFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.salesOrderFindMany.mock.calls[0][0].where).toEqual({ id: { in: [21] } })
    expect(mocks.quotationFindMany).not.toHaveBeenCalled()

    const first = queue.rows.find((r) => r.invoiceId === 1)
    expect(first?.tingkat).toBe("mengendap")
    expect(first?.salesEmployeeName).toBe("Sales Uji")
    expect(first?.sumberLabel).toBe("Dari Pesanan SO/2026/021")
    expect(first?.grandTotal).toBe(2000)
    const second = queue.rows.find((r) => r.invoiceId === 2)
    expect(second?.salesEmployeeName).toBeNull()
    expect(second?.sumberLabel).toBe("Langsung")
    expect(queue.summary.totalGrandTotal).toBe(2000)
    expect(queue.noticeText).toBe(SALES_INVOICE_DRAFT_NOTICE_TEXT)
    expect(mocks.salesInvoiceUpdate).not.toHaveBeenCalled()
    expect(mocks.salesInvoiceCreate).not.toHaveBeenCalled()
  })
})
