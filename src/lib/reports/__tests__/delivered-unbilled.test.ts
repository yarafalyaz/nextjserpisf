import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  DELIVERED_UNBILLED_EMPTY_TEXT,
  DELIVERED_UNBILLED_NOTICE_TEXT,
  buildDeliveredUnbilledQueue,
  deliveryStamp,
  type DeliveredUnbilledDeliveryInput,
  type DeliveredUnbilledInput,
  type DeliveredUnbilledInvoiceInput,
} from "../delivered-unbilled"
import { FULFILLABLE_ORDER_STATUSES } from "../order-fulfillment-data"
import { RECOGNISED_AR_STATUSES } from "../document-status"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const mocks = vi.hoisted(() => ({
  salesOrderFindMany: vi.fn(),
  deliveryOrderItemFindMany: vi.fn(),
  salesInvoiceFindMany: vi.fn(),
  salesOrderUpdate: vi.fn(),
  salesOrderCreate: vi.fn(),
  salesInvoiceCreate: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    salesOrder: {
      findMany: (...a: unknown[]) => mocks.salesOrderFindMany(...a),
      update: (...a: unknown[]) => mocks.salesOrderUpdate(...a),
      create: (...a: unknown[]) => mocks.salesOrderCreate(...a),
    },
    deliveryOrderItem: {
      findMany: (...a: unknown[]) => mocks.deliveryOrderItemFindMany(...a),
    },
    salesInvoice: {
      findMany: (...a: unknown[]) => mocks.salesInvoiceFindMany(...a),
      create: (...a: unknown[]) => mocks.salesInvoiceCreate(...a),
    },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

import { getDeliveredUnbilledQueue } from "../delivered-unbilled-data"

// Hari kalender WIB tetap: 2026-10-26 — instan 05:00 WIB.
const NOW = new Date("2026-10-25T22:00:00.000Z")
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function delivery(
  overrides: Partial<DeliveredUnbilledDeliveryInput> = {},
): DeliveredUnbilledDeliveryInput {
  return {
    status: "delivered",
    date: day(-5),
    confirmedAt: day(-6),
    deliveredAt: day(-5),
    deliveredQty: 10,
    ...overrides,
  }
}

function invoice(
  overrides: Partial<DeliveredUnbilledInvoiceInput> = {},
): DeliveredUnbilledInvoiceInput {
  return {
    salesOrderId: 1,
    status: "posted",
    deletedAt: null,
    grandTotal: 400_000,
    ...overrides,
  }
}

function input(overrides: Partial<DeliveredUnbilledInput> = {}): DeliveredUnbilledInput {
  return {
    salesOrderId: 1,
    slug: "so-1",
    documentNo: "SO/2026/001",
    status: "confirmed",
    deletedAt: null,
    date: day(-10),
    customerName: "PT Uji",
    lines: [{ lineId: 11, deliveredQty: 10, unitPrice: 100_000 }],
    deliveries: [delivery()],
    invoices: [],
    ...overrides,
  }
}

const build = (inputs: DeliveredUnbilledInput[], now: Date = NOW) =>
  buildDeliveredUnbilledQueue(inputs, now, FULFILLABLE_ORDER_STATUSES)

describe("FIN-BR-006 toleransi lunas Rp1 (satu sumber)", () => {
  it("sisa belum ditagih Rp0,50 = lunas -> keluar; Rp1,01 tetap tampil", () => {
    const lunas = build([input({ invoices: [invoice({ grandTotal: 999_999.5 })] })])
    expect(lunas.rows).toEqual([])

    const terbuka = build([input({ invoices: [invoice({ grandTotal: 999_998.99 })] })])
    expect(terbuka.rows.map((r) => r.salesOrderId)).toEqual([1])
    expect(terbuka.rows[0].unbilledValue).toBe(1.01)
  })
})

describe("buildDeliveredUnbilledQueue (builder murni)", () => {
  it("AC-DU-1: SO confirmed, DO delivered 10xRp100rb, tanpa faktur -> tampil sisa penuh", () => {
    const queue = build([input()])
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0]).toMatchObject({
      salesOrderId: 1,
      deliveredValue: 1_000_000,
      billedValue: 0,
      unbilledValue: 1_000_000,
    })
    expect(queue.totalDocuments).toBe(1)
    expect(queue.totalUnbilledValue).toBe(1_000_000)
    expect(DELIVERED_UNBILLED_NOTICE_TEXT.length).toBeGreaterThan(0)
    expect(DELIVERED_UNBILLED_EMPTY_TEXT.length).toBeGreaterThan(0)
  })

  it("AC-DU-2: faktur posted Rp400rb -> sisa Rp600rb; draft berubah posted menutup antrean", () => {
    const partial = build([input({ invoices: [invoice()] })])
    expect(partial.rows).toHaveLength(1)
    expect(partial.rows[0].billedValue).toBe(400_000)
    expect(partial.rows[0].unbilledValue).toBe(600_000)

    const closed = build([
      input({
        invoices: [
          invoice(),
          invoice({ grandTotal: 600_000 }),
        ],
      }),
    ])
    expect(closed.rows).toHaveLength(0)
  })

  it("AC-DU-3: faktur draft saja -> sisa tetap penuh; cancelled + terhapus lunak diabaikan", () => {
    const queue = build([
      input({
        invoices: [
          invoice({ status: "draft", grandTotal: 1_000_000 }),
          invoice({ status: "cancelled", grandTotal: 1_000_000 }),
          invoice({ status: "posted", deletedAt: day(-1), grandTotal: 1_000_000 }),
        ],
      }),
    ])
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].billedValue).toBe(0)
    expect(queue.rows[0].unbilledValue).toBe(1_000_000)
  })

  it("putusan tambahan Lead: faktur sent/approved tertaut TIDAK mengurangi; posted mengurangi", () => {
    for (const status of ["sent", "approved"]) {
      const queue = build([input({ invoices: [invoice({ status, grandTotal: 1_000_000 })] })])
      expect(queue.rows, status).toHaveLength(1)
      expect(queue.rows[0].billedValue, status).toBe(0)
      expect(queue.rows[0].unbilledValue, status).toBe(1_000_000)
    }
    expect([...RECOGNISED_AR_STATUSES]).toEqual(["posted", "partial", "paid"])
    for (const status of RECOGNISED_AR_STATUSES) {
      const queue = build([input({ invoices: [invoice({ status, grandTotal: 400_000 })] })])
      expect(queue.rows[0].billedValue, status).toBe(400_000)
    }
  })

  it("AC-DU-4: faktur tanpa salesOrderId (manual) tidak mengurangi SO mana pun", () => {
    const queue = build([
      input({
        invoices: [invoice({ salesOrderId: null, grandTotal: 1_000_000 })],
      }),
    ])
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].billedValue).toBe(0)
    expect(queue.rows[0].unbilledValue).toBe(1_000_000)
  })

  it("AC-DU-5: hanya DO draft -> tidak tampil; SO draft/cancelled/terhapus tidak tampil walau DO sah", () => {
    const draftOnly = build([
      input({
        lines: [{ lineId: 11, deliveredQty: 0, unitPrice: 100_000 }],
        deliveries: [delivery({ status: "draft", deliveredAt: null, confirmedAt: null })],
      }),
    ])
    expect(draftOnly.rows).toHaveLength(0)

    for (const status of ["draft", "cancelled"]) {
      expect(build([input({ status })]).rows, status).toHaveLength(0)
    }
    expect(build([input({ deletedAt: day(-1) })]).rows).toHaveLength(0)
    expect([...FULFILLABLE_ORDER_STATUSES]).toEqual(["confirmed", "processing", "completed"])
  })

  it("AC-DU-6: multi-DO parsial (4+6) + multi-faktur sah (400rb+300rb) -> sisa Rp300rb", () => {
    const queue = build([
      input({
        lines: [{ lineId: 11, deliveredQty: 10, unitPrice: 100_000 }],
        deliveries: [
          delivery({ deliveredQty: 4, deliveredAt: day(-8), date: day(-8) }),
          delivery({ deliveredQty: 6, deliveredAt: day(-3), date: day(-3) }),
        ],
        invoices: [invoice({ grandTotal: 400_000 }), invoice({ grandTotal: 300_000 })],
      }),
    ])
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].deliveredValue).toBe(1_000_000)
    expect(queue.rows[0].billedValue).toBe(700_000)
    expect(queue.rows[0].unbilledValue).toBe(300_000)
    // Titik umur = DO sah terakhir (day -3), bukan DO pertama.
    expect(queue.rows[0].lastDeliveryAt).toEqual(day(-3))
    expect(queue.rows[0].ageDays).toBe(3)
  })

  it("AC-DU-6: terfaktur melebihi terkirim -> tidak tampil, tanpa sisa negatif", () => {
    const queue = build([
      input({ invoices: [invoice({ grandTotal: 1_500_000 })] }),
    ])
    expect(queue.rows).toHaveLength(0)
    expect(queue.totalUnbilledValue).toBe(0)
  })

  it("sisa di bawah epsilon uang existing tidak tampil (terfaktur >= terkirim - epsilon)", () => {
    const queue = build([
      input({ invoices: [invoice({ grandTotal: 999_999.999 })] }),
    ])
    expect(queue.rows).toHaveLength(0)
  })

  it("Q-DU-1: stempel delivered pakai deliveredAt; shipped pakai confirmedAt; fallback date", () => {
    expect(
      deliveryStamp(delivery({ status: "delivered", deliveredAt: day(-2), confirmedAt: day(-4), date: day(-9) })),
    ).toEqual(day(-2))
    expect(
      deliveryStamp(delivery({ status: "shipped", deliveredAt: null, confirmedAt: day(-4), date: day(-9) })),
    ).toEqual(day(-4))
    expect(
      deliveryStamp(delivery({ status: "delivered", deliveredAt: null, confirmedAt: null, date: day(-9) })),
    ).toEqual(day(-9))
  })

  it("Q-DU-1: umur = MAX stempel DO sah; DO draft tidak menggeser titik umur", () => {
    const queue = build([
      input({
        deliveries: [
          delivery({ deliveredQty: 4, deliveredAt: day(-8), date: day(-8) }),
          delivery({ deliveredQty: 6, deliveredAt: day(-3), date: day(-3) }),
          delivery({ status: "draft", deliveredQty: 99, deliveredAt: null, confirmedAt: null, date: day(-1) }),
        ],
      }),
    ])
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].lastDeliveryAt).toEqual(day(-3))
    expect(queue.rows[0].ageDays).toBe(3)
  })

  it("Q-DU-2: urut umur tertua dulu (stempel menaik), seri documentNo lalu id; tanpa ember", () => {
    const queue = build([
      input({ salesOrderId: 2, documentNo: "SO/2026/002", deliveries: [delivery({ deliveredAt: day(-2), date: day(-2) })] }),
      input({ salesOrderId: 1, documentNo: "SO/2026/001", deliveries: [delivery({ deliveredAt: day(-9), date: day(-9) })] }),
      input({ salesOrderId: 3, documentNo: "SO/2026/003", deliveries: [delivery({ deliveredAt: day(-9), date: day(-9) })] }),
    ])
    expect(queue.rows.map((r) => r.salesOrderId)).toEqual([1, 3, 2])
    expect(queue.rows.map((r) => r.ageDays)).toEqual([9, 9, 2])
    expect(queue.rows[0]).not.toHaveProperty("bucket")
  })

  it("AC-DU-8/BR-DU-03: baris jasa tanpa DO sah tidak tampil (tanpa bukti terkirim)", () => {
    const queue = build([
      input({
        lines: [{ lineId: 11, deliveredQty: 0, unitPrice: 100_000 }],
        deliveries: [],
      }),
    ])
    expect(queue.rows).toHaveLength(0)
  })

  it("SO completed tetap populasi bila bersisa (status FULFILLABLE)", () => {
    expect(build([input({ status: "completed" })]).rows).toHaveLength(1)
    expect(build([input({ status: "processing" })]).rows).toHaveLength(1)
  })

  it("injeksi now menentukan umur — deterministik", () => {
    const inputs = [input()]
    expect(build(inputs, NOW).rows[0].ageDays).toBe(5)
    expect(build(inputs, new Date(NOW.getTime() + 2 * 86_400_000)).rows[0].ageDays).toBe(7)
  })
})

type OrderRow = {
  id: number
  slug: string | null
  documentNo: string
  status: string
  deletedAt: Date | null
  date: Date
  customer: { name: string }
  items: { id: number; qty: unknown; unitPrice: unknown }[]
}

function orderRow(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 1,
    slug: "so-1",
    documentNo: "SO/2026/001",
    status: "confirmed",
    deletedAt: null,
    date: day(-10),
    customer: { name: "PT Uji" },
    items: [{ id: 11, qty: 10, unitPrice: 100_000 }],
    ...overrides,
  }
}

describe("getDeliveredUnbilledQueue (loader)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue(undefined)
    mocks.salesOrderFindMany.mockResolvedValue([])
    mocks.deliveryOrderItemFindMany.mockResolvedValue([])
    mocks.salesInvoiceFindMany.mockResolvedValue([])
  })

  it("AC-DU-7: tanpa view_reports loader tertolak sebelum query apa pun", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getDeliveredUnbilledQueue({ now: NOW })).rejects.toThrow("Tidak memiliki izin")
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_reports")
    expect(mocks.salesOrderFindMany).not.toHaveBeenCalled()
    expect(mocks.deliveryOrderItemFindMany).not.toHaveBeenCalled()
    expect(mocks.salesInvoiceFindMany).not.toHaveBeenCalled()
  })

  it("query SO: populasi FULFILLABLE + deletedAt null; DO hanya shipped/delivered; faktur hanya RECOGNISED non-terhapus tertaut", async () => {
    await getDeliveredUnbilledQueue({ now: NOW })
    const soCall = mocks.salesOrderFindMany.mock.calls[0][0]
    expect(soCall.where.status.in).toEqual(["confirmed", "processing", "completed"])
    expect(soCall.where.deletedAt).toBeNull()

    mocks.salesOrderFindMany.mockResolvedValue([orderRow()])
    await getDeliveredUnbilledQueue({ now: NOW })
    const doCall = mocks.deliveryOrderItemFindMany.mock.calls.at(-1)?.[0]
    expect(doCall.where.deliveryOrder.status.in).toEqual(["shipped", "delivered"])
    expect(doCall.where.salesOrderItemId.in).toEqual([11])
    const invCall = mocks.salesInvoiceFindMany.mock.calls.at(-1)?.[0]
    expect(invCall.where.salesOrderId.in).toEqual([1])
    expect(invCall.where.deletedAt).toBeNull()
    expect(invCall.where.status.in).toEqual(["posted", "partial", "paid"])
  })

  it("AC-DU-1/2 via loader: DO delivered penuh tanpa faktur tampil; faktur posted mengurangi", async () => {
    mocks.salesOrderFindMany.mockResolvedValue([orderRow()])
    mocks.deliveryOrderItemFindMany.mockResolvedValue([
      {
        salesOrderItemId: 11,
        qty: 10,
        deliveryOrder: {
          id: 21,
          salesOrderId: 1,
          status: "delivered",
          date: day(-5),
          confirmedAt: day(-6),
          deliveredAt: day(-5),
        },
      },
    ])
    mocks.salesInvoiceFindMany.mockResolvedValue([
      { salesOrderId: 1, status: "posted", deletedAt: null, grandTotal: 400_000 },
    ])
    const queue = await getDeliveredUnbilledQueue({ now: NOW })
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].deliveredValue).toBe(1_000_000)
    expect(queue.rows[0].billedValue).toBe(400_000)
    expect(queue.rows[0].unbilledValue).toBe(600_000)
    expect(queue.rows[0].lastDeliveryAt).toEqual(day(-5))
    expect(queue.rows[0].ageDays).toBe(5)
  })

  it("filter periode + pelanggan diteruskan ke query SO", async () => {
    await getDeliveredUnbilledQueue({ now: NOW, start: day(-30), end: day(0), customerId: 7 })
    const call = mocks.salesOrderFindMany.mock.calls[0][0]
    expect(call.where.customerId).toBe(7)
    expect(call.where.date).toEqual({ gte: day(-30), lte: day(0) })
  })

  it("baca-saja: loader tidak pernah menulis SO/faktur (AC-DU-7 lapis loader)", async () => {
    mocks.salesOrderFindMany.mockResolvedValue([orderRow()])
    await getDeliveredUnbilledQueue({ now: NOW })
    expect(mocks.salesOrderUpdate).not.toHaveBeenCalled()
    expect(mocks.salesOrderCreate).not.toHaveBeenCalled()
    expect(mocks.salesInvoiceCreate).not.toHaveBeenCalled()
  })

  it("tanpa SO: query DO/faktur tidak jalan (anti query sia-sia)", async () => {
    const queue = await getDeliveredUnbilledQueue({ now: NOW })
    expect(queue.rows).toHaveLength(0)
    expect(mocks.deliveryOrderItemFindMany).not.toHaveBeenCalled()
    expect(mocks.salesInvoiceFindMany).not.toHaveBeenCalled()
  })
})
