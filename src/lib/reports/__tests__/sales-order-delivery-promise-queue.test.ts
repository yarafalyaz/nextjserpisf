import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  SO_DELIVERY_PROMISE_BUCKET_LABELS,
  SO_DELIVERY_PROMISE_DUE_SOON_DAYS,
  SO_DELIVERY_PROMISE_POPULATION_STATUSES,
  SO_DELIVERY_PROMISE_QUEUE_NOTICE_TEXT,
  buildSalesOrderDeliveryPromiseQueue,
  type SalesOrderDeliveryPromiseInput,
} from "../sales-order-delivery-promise-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const mocks = vi.hoisted(() => ({
  salesOrderFindMany: vi.fn(),
  salesOrderCount: vi.fn(),
  deliveryOrderItemFindMany: vi.fn(),
  salesOrderUpdate: vi.fn(),
  salesOrderCreate: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    salesOrder: {
      findMany: (...a: unknown[]) => mocks.salesOrderFindMany(...a),
      count: (...a: unknown[]) => mocks.salesOrderCount(...a),
      update: (...a: unknown[]) => mocks.salesOrderUpdate(...a),
      create: (...a: unknown[]) => mocks.salesOrderCreate(...a),
    },
    deliveryOrderItem: {
      findMany: (...a: unknown[]) => mocks.deliveryOrderItemFindMany(...a),
    },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

import { getSalesOrderDeliveryPromiseQueue } from "../sales-order-delivery-promise-queue-data"

// Hari kalender WIB tetap: 2026-10-26 — instan 05:00 WIB.
const NOW = new Date("2026-10-25T22:00:00.000Z")
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function input(
  overrides: Partial<SalesOrderDeliveryPromiseInput> = {},
): SalesOrderDeliveryPromiseInput {
  return {
    salesOrderId: 1,
    slug: "so-1",
    documentNo: "SO/2026/001",
    status: "processing",
    date: day(-10),
    deliveryDate: day(-1),
    customerName: "PT Uji",
    salesEmployeeName: "Sales Uji",
    lines: [{ orderedQty: 10, deliveredQty: 4, unitPrice: 1000 }],
    ...overrides,
  }
}

describe("buildSalesOrderDeliveryPromiseQueue (builder murni)", () => {
  it("AC-SD-01: overdue tampil sebelum due_today; overdue paling lama dulu", () => {
    const queue = buildSalesOrderDeliveryPromiseQueue(
      [
        input({ salesOrderId: 2, documentNo: "SO/2026/002", deliveryDate: day(0) }),
        input({ salesOrderId: 1, documentNo: "SO/2026/001", deliveryDate: day(-1) }),
        input({ salesOrderId: 3, documentNo: "SO/2026/003", deliveryDate: day(-5) }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.salesOrderId)).toEqual([3, 1, 2])
    expect(queue.rows.map((r) => r.bucket)).toEqual(["overdue", "overdue", "due_today"])
    expect(queue.rows[0].daysUntilDue).toBe(-5)
    expect(queue.rows[0].bucketLabel).toBe(SO_DELIVERY_PROMISE_BUCKET_LABELS.overdue)
  })

  it("AC-SD-02: deliveryDate tengah malam WIB hari ini = due_today, bukan overdue", () => {
    const queue = buildSalesOrderDeliveryPromiseQueue(
      [input({ deliveryDate: new Date(TODAY.getTime()) })],
      NOW,
    )
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].bucket).toBe("due_today")
    expect(queue.rows[0].daysUntilDue).toBe(0)
  })

  it("AC-SD-03: tepat +ambang = due_soon; +ambang+1 tidak tampil; ambang dari konstan bernama", () => {
    expect(SO_DELIVERY_PROMISE_DUE_SOON_DAYS).toBe(3)
    const within = buildSalesOrderDeliveryPromiseQueue(
      [input({ deliveryDate: day(SO_DELIVERY_PROMISE_DUE_SOON_DAYS) })],
      NOW,
    )
    expect(within.rows[0].bucket).toBe("due_soon")
    const beyond = buildSalesOrderDeliveryPromiseQueue(
      [input({ deliveryDate: day(SO_DELIVERY_PROMISE_DUE_SOON_DAYS + 1) })],
      NOW,
    )
    expect(beyond.rows).toHaveLength(0)
  })

  it("ambang bisa diubah lewat argumen tanpa ubah konstan (Q-SD-2 konfigurabel)", () => {
    const queue = buildSalesOrderDeliveryPromiseQueue(
      [input({ deliveryDate: day(7) })],
      NOW,
      7,
    )
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].bucket).toBe("due_soon")
  })

  it("AC-SD-04: terkirim penuh tidak tampil walau janji lewat", () => {
    const queue = buildSalesOrderDeliveryPromiseQueue(
      [input({ lines: [{ orderedQty: 10, deliveredQty: 10, unitPrice: 1000 }] })],
      NOW,
    )
    expect(queue.rows).toHaveLength(0)
  })

  it("AC-SD-06: completed/cancelled/draft bersisa + lewat janji tidak tampil", () => {
    const queue = buildSalesOrderDeliveryPromiseQueue(
      [
        input({ salesOrderId: 1, status: "completed" }),
        input({ salesOrderId: 2, status: "cancelled", documentNo: "SO/2026/002" }),
        input({ salesOrderId: 3, status: "draft", documentNo: "SO/2026/003" }),
      ],
      NOW,
    )
    expect(queue.rows).toHaveLength(0)
    expect([...SO_DELIVERY_PROMISE_POPULATION_STATUSES]).toEqual([
      "approved",
      "confirmed",
      "processing",
    ])
  })

  it("approved/confirmed/processing semua masuk populasi", () => {
    const queue = buildSalesOrderDeliveryPromiseQueue(
      [
        input({ salesOrderId: 1, status: "approved" }),
        input({ salesOrderId: 2, status: "confirmed", documentNo: "SO/2026/002" }),
        input({ salesOrderId: 3, status: "processing", documentNo: "SO/2026/003" }),
      ],
      NOW,
    )
    expect(queue.rows).toHaveLength(3)
  })

  it("AC-SD-06/BR-SD-06: tanpa deliveryDate bukan baris antrean", () => {
    const queue = buildSalesOrderDeliveryPromiseQueue(
      [input({ deliveryDate: null })],
      NOW,
    )
    expect(queue.rows).toHaveLength(0)
  })

  it("AC-SD-09: penjual null tetap tampil; over-delivered satu baris tidak menutup sisa baris lain", () => {
    const queue = buildSalesOrderDeliveryPromiseQueue(
      [
        input({
          salesEmployeeName: null,
          lines: [
            { orderedQty: 5, deliveredQty: 8, unitPrice: 9999 },
            { orderedQty: 10, deliveredQty: 4, unitPrice: 1000 },
          ],
        }),
      ],
      NOW,
    )
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].salesEmployeeName).toBeNull()
    expect(queue.rows[0].linesRemaining).toBe(1)
    expect(queue.rows[0].outstandingValue).toBe(6000)
  })

  it("AC-SD-10: dua SO overdue tanggal sama urut documentNo asc lalu id", () => {
    const queue = buildSalesOrderDeliveryPromiseQueue(
      [
        input({ salesOrderId: 9, documentNo: "SO/2026/009", deliveryDate: day(-2) }),
        input({ salesOrderId: 2, documentNo: "SO/2026/002", deliveryDate: day(-2) }),
        input({ salesOrderId: 1, documentNo: "SO/2026/002", deliveryDate: day(-2) }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.salesOrderId)).toEqual([1, 2, 9])
  })

  it("total per ember + total keseluruhan konsisten dengan baris", () => {
    const queue = buildSalesOrderDeliveryPromiseQueue(
      [
        input({ salesOrderId: 1, deliveryDate: day(-1) }),
        input({ salesOrderId: 2, documentNo: "SO/2026/002", deliveryDate: day(0) }),
        input({
          salesOrderId: 3,
          documentNo: "SO/2026/003",
          deliveryDate: day(2),
          lines: [{ orderedQty: 2, deliveredQty: 0, unitPrice: 500 }],
        }),
      ],
      NOW,
    )
    expect(queue.totalDocuments).toBe(3)
    expect(queue.totals.map((t) => [t.bucket, t.documents])).toEqual([
      ["overdue", 1],
      ["due_today", 1],
      ["due_soon", 1],
    ])
    expect(queue.totals.find((t) => t.bucket === "due_soon")?.outstandingValue).toBe(1000)
    expect(queue.totalOutstandingValue).toBe(6000 + 6000 + 1000)
    expect(SO_DELIVERY_PROMISE_QUEUE_NOTICE_TEXT.length).toBeGreaterThan(0)
  })

  it("injeksi now menentukan ember — now berbeda, hasil berbeda (deterministik)", () => {
    const rows = [input({ deliveryDate: day(1) })]
    expect(buildSalesOrderDeliveryPromiseQueue(rows, NOW).rows[0].bucket).toBe("due_soon")
    const later = new Date(NOW.getTime() + 2 * 86_400_000)
    expect(buildSalesOrderDeliveryPromiseQueue(rows, later).rows[0].bucket).toBe("overdue")
  })
})

type OrderRow = {
  id: number
  slug: string | null
  documentNo: string
  status: string
  date: Date
  deliveryDate: Date | null
  customer: { name: string }
  salesEmployee: { name: string } | null
  items: { id: number; qty: unknown; unitPrice: unknown }[]
}

function orderRow(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 1,
    slug: "so-1",
    documentNo: "SO/2026/001",
    status: "processing",
    date: day(-10),
    deliveryDate: day(-1),
    customer: { name: "PT Uji" },
    salesEmployee: { name: "Sales Uji" },
    items: [{ id: 11, qty: 10, unitPrice: 1000 }],
    ...overrides,
  }
}

describe("getSalesOrderDeliveryPromiseQueue (loader)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue(undefined)
    mocks.salesOrderFindMany.mockResolvedValue([])
    mocks.salesOrderCount.mockResolvedValue(0)
    mocks.deliveryOrderItemFindMany.mockResolvedValue([])
  })

  it("AC-SD-08: tanpa view_sales_orders loader tertolak sebelum query apa pun", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getSalesOrderDeliveryPromiseQueue(NOW)).rejects.toThrow(
      "Tidak memiliki izin",
    )
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_sales_orders")
    expect(mocks.salesOrderFindMany).not.toHaveBeenCalled()
    expect(mocks.salesOrderCount).not.toHaveBeenCalled()
  })

  it("AC-SD-05: hanya DeliveryOrder shipped/delivered mengurangi sisa (query loader menegakkan)", async () => {
    mocks.salesOrderFindMany.mockResolvedValue([orderRow()])
    mocks.deliveryOrderItemFindMany.mockResolvedValue([
      { salesOrderItemId: 11, qty: 4 },
    ])
    const result = await getSalesOrderDeliveryPromiseQueue(NOW)
    expect(result.queue.rows).toHaveLength(1)
    expect(result.queue.rows[0].linesRemaining).toBe(1)
    expect(result.queue.rows[0].outstandingValue).toBe(6000)
    const deliveryCall = mocks.deliveryOrderItemFindMany.mock.calls[0][0]
    expect(deliveryCall.where.deliveryOrder.status.in).toEqual(["shipped", "delivered"])
    expect(deliveryCall.where.salesOrderItemId.in).toEqual([11])
  })

  it("AC-SD-05: delivered penuh dari shipped/delivered mengeluarkan SO dari antrean", async () => {
    mocks.salesOrderFindMany.mockResolvedValue([orderRow()])
    mocks.deliveryOrderItemFindMany.mockResolvedValue([
      { salesOrderItemId: 11, qty: 10 },
    ])
    const result = await getSalesOrderDeliveryPromiseQueue(NOW)
    expect(result.queue.rows).toHaveLength(0)
  })

  it("AC-SD-07: penanda tanpa-janji dari count populasi-status + deliveryDate null, bukan baris", async () => {
    mocks.salesOrderFindMany.mockResolvedValue([])
    mocks.salesOrderCount.mockResolvedValue(3)
    const result = await getSalesOrderDeliveryPromiseQueue(NOW)
    expect(result.withoutPromiseCount).toBe(3)
    expect(result.queue.rows).toHaveLength(0)
    const countCall = mocks.salesOrderCount.mock.calls[0][0]
    expect(countCall.where.deliveryDate).toBeNull()
    expect(countCall.where.status.in).toEqual(["approved", "confirmed", "processing"])
    expect(countCall.where.deletedAt).toBeNull()
  })

  it("query SO: populasi status + deletedAt null + deliveryDate non-null dalam jendela", async () => {
    await getSalesOrderDeliveryPromiseQueue(NOW)
    const call = mocks.salesOrderFindMany.mock.calls[0][0]
    expect(call.where.status.in).toEqual(["approved", "confirmed", "processing"])
    expect(call.where.deletedAt).toBeNull()
    expect(call.where.deliveryDate.not).toBeNull()
    expect(call.where.deliveryDate.lte).toEqual(
      new Date(TODAY.getTime() + SO_DELIVERY_PROMISE_DUE_SOON_DAYS * 86_400_000),
    )
  })

  it("baca-saja: loader tidak pernah menulis SalesOrder (AC-SD-10 lapis loader)", async () => {
    mocks.salesOrderFindMany.mockResolvedValue([orderRow()])
    await getSalesOrderDeliveryPromiseQueue(NOW)
    expect(mocks.salesOrderUpdate).not.toHaveBeenCalled()
    expect(mocks.salesOrderCreate).not.toHaveBeenCalled()
  })

  it("tanpa SO: query terkirim tidak jalan (anti query sia-sia), penanda tetap dibaca", async () => {
    mocks.salesOrderCount.mockResolvedValue(2)
    const result = await getSalesOrderDeliveryPromiseQueue(NOW)
    expect(mocks.deliveryOrderItemFindMany).not.toHaveBeenCalled()
    expect(result.withoutPromiseCount).toBe(2)
  })
})
