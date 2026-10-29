import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock prisma so the service runs against in-memory fixtures. GL-BR-003 K1:
// resync hanya menyentuh SO/faktur DRAFT — tidak ada re-derive status payment
// maupun reverse+repost di jalur resync.
const mocks = vi.hoisted(() => {
  const prismaMock: any = {
    quotation: { findUnique: vi.fn() },
    salesOrder: { findMany: vi.fn(), update: vi.fn() },
    salesOrderItem: { deleteMany: vi.fn(), createMany: vi.fn() },
    salesInvoice: { findMany: vi.fn(), update: vi.fn(), findUniqueOrThrow: vi.fn() },
    salesInvoiceItem: { deleteMany: vi.fn(), createMany: vi.fn() },
    salesPayment: { findMany: vi.fn(), count: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(async (fn: any) => fn(prismaMock)),
  }
  return { prismaMock }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { resyncOnEdit } from "../quotation-sync.service"

describe("quotation-sync.service / resyncOnEdit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // No real (non-DP) settlement by default → documents remain editable.
    mocks.prismaMock.salesPayment.count.mockResolvedValue(0)
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([])
  })

  it("hanya menyentuh SO draft (G1 GL-BR-003: SO confirmed/processing dilewati)", async () => {
    const p = mocks.prismaMock
    p.quotation.findUnique.mockResolvedValue({
      id: 1, status: "draft", subtotal: 500, discount: 0, tax: 0, grandTotal: 500,
      sections: [{ items: [] }],
    })
    p.salesOrder.findMany.mockResolvedValue([{ id: 10 }])
    p.salesOrder.update.mockResolvedValue({})

    await resyncOnEdit(1)

    expect(p.salesOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ quotationId: 1, status: "draft" }) }),
    )
    // SO draft tetap di-resync.
    expect(p.salesOrder.update).toHaveBeenCalledTimes(1)
  })

  it("hanya mengambil faktur draft (G1 GL-BR-003: tanpa reverse+repost diam-diam)", async () => {
    const p = mocks.prismaMock
    p.quotation.findUnique.mockResolvedValue({
      id: 2, status: "draft", subtotal: 800, discount: 0, tax: 0, grandTotal: 800,
      sections: [{ items: [{ itemId: 1, qty: 2, unitPrice: 100, discount: 0, total: 200 }] }],
    })
    p.salesOrder.findMany.mockResolvedValue([{ id: 10 }, { id: 20 }])
    p.salesOrder.update.mockResolvedValue({})
    p.salesOrderItem.deleteMany.mockResolvedValue({ count: 0 })
    p.salesOrderItem.createMany.mockResolvedValue({ count: 1 })
    p.salesInvoiceItem.deleteMany.mockResolvedValue({ count: 0 })
    p.salesInvoiceItem.createMany.mockResolvedValue({ count: 1 })
    p.salesInvoice.update.mockResolvedValue({})

    // DB jujur menghormati filter status service: hanya draft dikembalikan.
    const allInvoices = [
      { id: 100, salesOrderId: 10, status: "posted", paidAmount: 0, grandTotal: 800 },
      { id: 101, salesOrderId: 10, status: "draft", paidAmount: 0, grandTotal: 800 },
      { id: 300, salesOrderId: 10, status: "cancelled", paidAmount: 0, grandTotal: 800 },
    ]
    p.salesInvoice.findMany.mockImplementation(async (args: any) => {
      const want = args?.where?.status
      return allInvoices.filter((inv) => inv.status === want)
    })

    await resyncOnEdit(2)

    // Satu lookup batch dengan status draft persis.
    const invoiceFindManyCalls = p.salesInvoice.findMany.mock.calls.filter(
      (call: any[]) => call[0]?.where?.salesOrderId?.in,
    )
    expect(invoiceFindManyCalls).toHaveLength(1)
    expect(invoiceFindManyCalls[0][0].where.salesOrderId.in).toEqual([10, 20])
    expect(invoiceFindManyCalls[0][0].where.status).toBe("draft")
    // Hanya faktur draft 101 yang ditulis ulang; posted/cancelled tak tersentuh.
    expect(p.salesInvoiceItem.deleteMany).toHaveBeenCalledTimes(1)
    expect(p.salesInvoiceItem.deleteMany).toHaveBeenCalledWith({ where: { salesInvoiceId: 101 } })
    expect(p.salesInvoice.update).toHaveBeenCalledTimes(1)
  })

  it("E127-8b/L-1: faktur cancelled tidak pernah tersentuh resyncOnEdit", async () => {
    const p = mocks.prismaMock
    p.quotation.findUnique.mockResolvedValue({
      id: 3, status: "draft", subtotal: 800, discount: 0, tax: 0, grandTotal: 800,
      sections: [{ items: [{ itemId: 1, qty: 1, unitPrice: 800, discount: 0, total: 800 }] }],
    })
    p.salesOrder.findMany.mockResolvedValue([{ id: 10 }])
    p.salesOrder.update.mockResolvedValue({})
    p.salesOrderItem.deleteMany.mockResolvedValue({ count: 0 })
    p.salesOrderItem.createMany.mockResolvedValue({ count: 1 })
    p.salesInvoice.findMany.mockResolvedValue([])
    p.salesInvoiceItem.deleteMany.mockResolvedValue({ count: 0 })
    p.salesInvoice.update.mockResolvedValue({})

    await resyncOnEdit(3)

    const invoiceQuery = p.salesInvoice.findMany.mock.calls[0][0]
    expect(invoiceQuery.where.status).toBe("draft")
    expect(p.salesInvoiceItem.deleteMany).not.toHaveBeenCalled()
    expect(p.salesInvoice.update).not.toHaveBeenCalled()
  })
})
