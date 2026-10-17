import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Pemuatan data laporan Pemenuhan Pesanan.
 *
 * Yang dijaga di sini adalah rantai yang selama ini putus: "terkirim" HANYA bisa
 * dijumlahkan dari baris surat jalan yang menunjuk baris pesanan
 * (`DeliveryOrderItem.salesOrderItemId`) dan surat jalannya harus benar-benar
 * jalan (`shipped`/`delivered`). Kalau salah satu sisi hilang, laporan kembali
 * membaca 0 terkirim untuk semua pesanan.
 */

const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue({}),
    count: vi.fn().mockResolvedValue(0),
    aggregate: vi.fn().mockResolvedValue({ _sum: {} }),
  })

  const prismaMock = {
    salesOrder: buildModelMock(),
    deliveryOrderItem: buildModelMock(),
    item: buildModelMock(),
  }

  return { prismaMock }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { loadOrderFulfillment, SHIPPED_DELIVERY_STATUSES, FULFILLABLE_ORDER_STATUSES } from "../order-fulfillment-data"

const period = {
  start: new Date("2026-10-01T00:00:00.000Z"),
  end: new Date("2026-10-31T23:59:59.000Z"),
}

const ORDER = {
  id: 1,
  documentNo: "SO-001",
  date: new Date("2026-10-05T00:00:00.000Z"),
  status: "confirmed",
  customer: { name: "Toko Maju" },
  items: [{ id: 11, itemId: 5, description: "Busi", qty: 10, unitPrice: 25_000 }],
}

describe("loadOrderFulfillment", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prismaMock.salesOrder.findMany.mockResolvedValue([ORDER])
    mocks.prismaMock.deliveryOrderItem.findMany.mockResolvedValue([])
    mocks.prismaMock.item.findMany.mockResolvedValue([{ id: 5, sku: "BRG-1", name: "Busi", unitOfMeasure: "PCS" }])
  })

  it("membaca baris surat jalan lewat salesOrderItemId dan hanya status terkirim", async () => {
    await loadOrderFulfillment(period)

    expect(mocks.prismaMock.deliveryOrderItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          salesOrderItemId: { in: [11] },
          deliveryOrder: { status: { in: [...SHIPPED_DELIVERY_STATUSES] } },
        },
      }),
    )
  })

  it("membatasi pesanan yang dimuat ke status yang memang jadi komitmen", async () => {
    await loadOrderFulfillment(period)

    const where = mocks.prismaMock.salesOrder.findMany.mock.calls[0][0].where
    expect(where.status.in).toEqual([...FULFILLABLE_ORDER_STATUSES])
    expect(where.date).toEqual({ gte: period.start, lte: period.end })
  })

  it("menghitung terkirim dari baris surat jalan (pesanan jadi terkirim sebagian)", async () => {
    mocks.prismaMock.deliveryOrderItem.findMany.mockResolvedValue([{ salesOrderItemId: 11, qty: 4 }])

    const { fulfillment } = await loadOrderFulfillment(period)

    expect(fulfillment.totals).toEqual({
      orders: 1,
      items: 1,
      partiallyShipped: 1,
      notShipped: 0,
      outstandingValue: 6 * 25_000,
    })
  })

  it("menjumlahkan beberapa surat jalan untuk baris pesanan yang sama", async () => {
    mocks.prismaMock.deliveryOrderItem.findMany.mockResolvedValue([
      { salesOrderItemId: 11, qty: 4 },
      { salesOrderItemId: 11, qty: 6 },
    ])

    const { fulfillment } = await loadOrderFulfillment(period)

    expect(fulfillment.totals.items).toBe(0)
    expect(fulfillment.totals.outstandingValue).toBe(0)
  })

  it("mengabaikan baris surat jalan tanpa kaitan ke baris pesanan", async () => {
    mocks.prismaMock.deliveryOrderItem.findMany.mockResolvedValue([{ salesOrderItemId: null, qty: 10 }])

    const { fulfillment } = await loadOrderFulfillment(period)

    expect(fulfillment.totals.notShipped).toBe(1)
    expect(fulfillment.totals.outstandingValue).toBe(10 * 25_000)
  })

  it("tanpa surat jalan jalan, semua baris tetap belum terkirim", async () => {
    const { fulfillment } = await loadOrderFulfillment(period)

    expect(fulfillment.totals.notShipped).toBe(1)
    expect(fulfillment.totals.partiallyShipped).toBe(0)
  })
})
