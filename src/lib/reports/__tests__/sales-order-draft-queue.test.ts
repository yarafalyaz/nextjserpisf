import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  SALES_ORDER_DRAFT_NOTICE_TEXT,
  SALES_ORDER_DRAFT_QUEUE_TITLE_TEXT,
  SALES_ORDER_DRAFT_STALE_DAYS,
  SALES_ORDER_DRAFT_TOTAL_LABEL_TEXT,
  buildSalesOrderDraftQueue,
  deriveSalesOrderDraftAge,
  type SalesOrderDraftInput,
} from "../sales-order-draft-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const mocks = vi.hoisted(() => ({
  salesOrderFindMany: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    salesOrder: {
      findMany: (...a: unknown[]) => mocks.salesOrderFindMany(...a),
    },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

import { getSalesOrderDraftQueue } from "../sales-order-draft-queue-data"

// Hari kalender WIB tetap: 2026-10-26 — instan 05:00 WIB.
const NOW = new Date("2026-10-25T22:00:00.000Z")
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function input(overrides: Partial<SalesOrderDraftInput> = {}): SalesOrderDraftInput {
  return {
    salesOrderId: 1,
    slug: "so-1",
    documentNo: "SO/2026/001",
    status: "draft",
    deletedAt: null,
    customerId: 10,
    customerName: "PT Uji",
    quotationId: null,
    quotationDocumentNo: null,
    salesEmployeeId: 7,
    salesEmployeeName: "Sales Uji",
    date: day(-2),
    deliveryDate: null,
    createdAt: day(-2),
    grandTotal: 1000,
    ...overrides,
  }
}

describe("sales-order-draft-queue (F-2026-10-26-056-S tahap 1)", () => {
  it("konstanta ambang + kata verbatim putusan Q-SOQ-1/2", () => {
    expect(SALES_ORDER_DRAFT_STALE_DAYS).toBe(7)
    expect(SALES_ORDER_DRAFT_QUEUE_TITLE_TEXT).toBe("Pesanan Draft Mengendap")
    expect(SALES_ORDER_DRAFT_TOTAL_LABEL_TEXT).toBe("nilai draft belum disetujui")
    expect(SALES_ORDER_DRAFT_NOTICE_TEXT).toBe(
      "Daftar ini hanya pesanan penjualan yang masih draft dan belum disetujui. Draft belum bisa dikirim dan belum dihitung sebagai pesanan berjalan sampai disetujui lewat detail pesanan.",
    )
  })

  it("AC-SOQ-B1: approved/confirmed/cancelled/terhapus/status asing tidak masuk populasi", () => {
    const queue = buildSalesOrderDraftQueue(
      [
        input({ salesOrderId: 1, status: "approved", createdAt: day(-30) }),
        input({ salesOrderId: 2, status: "confirmed", createdAt: day(-30) }),
        input({ salesOrderId: 3, status: "cancelled", createdAt: day(-30) }),
        input({ salesOrderId: 4, status: "asing-warisan", createdAt: day(-30) }),
        input({ salesOrderId: 5, deletedAt: day(0), createdAt: day(-30) }),
        input({ salesOrderId: 6, createdAt: day(-30) }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.salesOrderId)).toEqual([6])
  })

  it("AC-SOQ-B2: batas umur — hari sama 0, tepat 7 mengendap, 6 menunggu", () => {
    expect(deriveSalesOrderDraftAge(day(0), TODAY)).toEqual({
      umurDraftHari: 0,
      umurDariMasaDepan: false,
    })
    const queue = buildSalesOrderDraftQueue(
      [
        input({ salesOrderId: 1, createdAt: day(-7) }),
        input({ salesOrderId: 2, createdAt: day(-6) }),
      ],
      NOW,
    )
    expect(queue.rows.find((r) => r.salesOrderId === 1)?.tingkat).toBe("mengendap")
    expect(queue.rows.find((r) => r.salesOrderId === 2)?.tingkat).toBe("menunggu")
  })

  it("EC-SOQ-4: createdAt masa depan umur 0 tertanda, bukan negatif", () => {
    expect(deriveSalesOrderDraftAge(day(3), TODAY)).toEqual({
      umurDraftHari: 0,
      umurDariMasaDepan: true,
    })
  })

  it("Q-SOQ-3: mengendap dulu, lalu umur tertua; seri documentNo asc", () => {
    const queue = buildSalesOrderDraftQueue(
      [
        input({ salesOrderId: 1, documentNo: "SO/B", createdAt: day(-1) }),
        input({ salesOrderId: 2, documentNo: "SO/C", createdAt: day(-10) }),
        input({ salesOrderId: 3, documentNo: "SO/A", createdAt: day(-20) }),
        input({ salesOrderId: 4, documentNo: "SO/D", createdAt: day(-10) }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.salesOrderId)).toEqual([3, 2, 4, 1])
  })

  it("AC-SOQ-B5: rekap = baris yang sama (hitungan + Σ grandTotal)", () => {
    const queue = buildSalesOrderDraftQueue(
      [
        input({ salesOrderId: 1, createdAt: day(-9), grandTotal: 100.5 }),
        input({ salesOrderId: 2, createdAt: day(-1), grandTotal: 200 }),
      ],
      NOW,
    )
    expect(queue.levelCounts).toEqual({ mengendap: 1, menunggu: 1 })
    expect(queue.totalGrandTotal).toBe(300.5)
    expect(queue.totalDocuments).toBe(2)
  })

  it("BR-SOQ-06/07: janji kosong hanya penanda; asal + penjual null apa adanya; grandTotal 0 tampil", () => {
    const queue = buildSalesOrderDraftQueue(
      [
        input({
          deliveryDate: null,
          salesEmployeeId: null,
          salesEmployeeName: null,
          grandTotal: 0,
        }),
        input({
          salesOrderId: 2,
          deliveryDate: day(5),
          quotationId: 42,
          quotationDocumentNo: "QUO/2026/042",
        }),
      ],
      NOW,
    )
    const direct = queue.rows.find((r) => r.salesOrderId === 1)!
    expect(direct.punyaJanji).toBe(false)
    expect(direct.asalLabel).toBe("Langsung")
    expect(direct.salesEmployeeName).toBeNull()
    expect(direct.grandTotal).toBe(0)
    const fromQuotation = queue.rows.find((r) => r.salesOrderId === 2)!
    expect(fromQuotation.punyaJanji).toBe(true)
    expect(fromQuotation.asalLabel).toBe("Dari Penawaran QUO/2026/042")
  })
})

describe("getSalesOrderDraftQueue (loader fail-closed, AC-SOQ-B4)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue(undefined)
    mocks.salesOrderFindMany.mockResolvedValue([])
  })

  it("tanpa izin loader menolak sebelum query apa pun (findMany 0x)", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getSalesOrderDraftQueue({ now: NOW })).rejects.toThrow("Tidak memiliki izin")
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_sales_orders")
    expect(mocks.salesOrderFindMany).not.toHaveBeenCalled()
  })

  it("query populasi persis {status:draft, deletedAt:null}; pemetaan relasional customer/quotation/salesEmployee", async () => {
    mocks.salesOrderFindMany.mockResolvedValue([
      {
        id: 1,
        slug: "so-1",
        documentNo: "SO/2026/001",
        status: "draft",
        deletedAt: null,
        customerId: 10,
        quotationId: 42,
        salesEmployeeId: 7,
        date: day(-10),
        deliveryDate: day(3),
        createdAt: day(-10),
        grandTotal: 1500,
        customer: { name: "PT Uji" },
        quotation: { documentNo: "QUO/2026/042" },
        salesEmployee: { name: "Sales Uji" },
      },
      {
        id: 2,
        slug: null,
        documentNo: "SO/2026/002",
        status: "draft",
        deletedAt: null,
        customerId: 11,
        quotationId: null,
        salesEmployeeId: null,
        date: day(-1),
        deliveryDate: null,
        createdAt: day(-1),
        grandTotal: 0,
        customer: { name: "PT Lain" },
        quotation: null,
        salesEmployee: null,
      },
    ])

    const queue = await getSalesOrderDraftQueue({ now: NOW })

    expect(mocks.salesOrderFindMany).toHaveBeenCalledTimes(1)
    const arg = mocks.salesOrderFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({ status: "draft", deletedAt: null })

    const fromQuotation = queue.rows.find((r) => r.salesOrderId === 1)!
    expect(fromQuotation.customerName).toBe("PT Uji")
    expect(fromQuotation.quotationDocumentNo).toBe("QUO/2026/042")
    expect(fromQuotation.asalLabel).toBe("Dari Penawaran QUO/2026/042")
    expect(fromQuotation.salesEmployeeName).toBe("Sales Uji")
    expect(fromQuotation.tingkat).toBe("mengendap")
    expect(fromQuotation.grandTotal).toBe(1500)

    const direct = queue.rows.find((r) => r.salesOrderId === 2)!
    expect(direct.customerName).toBe("PT Lain")
    expect(direct.quotationDocumentNo).toBeNull()
    expect(direct.asalLabel).toBe("Langsung")
    expect(direct.salesEmployeeId).toBeNull()
    expect(direct.salesEmployeeName).toBeNull()
    expect(queue.totalDocuments).toBe(2)
  })
})
