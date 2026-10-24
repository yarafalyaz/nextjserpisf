import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"

/**
 * F-2026-10-22-057-S §2/§3 loader tabel reservasi detail WO: passthrough
 * baris StockReservation (bukti primer), releasedBy → nama, baris
 * gudang-belum-ditentukan terpisah sebagai unreserved (bukan released).
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({ stockReservation: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } }),
    ),
    workOrder: { findUnique: vi.fn() },
    stockReservation: { findMany: vi.fn() },
    item: { findMany: vi.fn() },
    warehouse: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    materialIssue: { findFirst: vi.fn() },
    materialIssueItem: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { getWorkOrderReservations } from "../work-order-reservations-data"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({ stockReservation: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } }),
  )
  mocks.prismaMock.stockReservation.findMany.mockResolvedValue([])
  mocks.prismaMock.item.findMany.mockResolvedValue([])
  mocks.prismaMock.warehouse.findMany.mockResolvedValue([])
  mocks.prismaMock.user.findMany.mockResolvedValue([])
  mocks.prismaMock.materialIssue.findFirst.mockResolvedValue(null)
  mocks.prismaMock.materialIssueItem.findMany.mockResolvedValue([])
})

describe("getWorkOrderReservations", () => {
  it("WO tak ada → null", async () => {
    mocks.prismaMock.workOrder.findUnique.mockResolvedValue(null)
    expect(await getWorkOrderReservations(99)).toBeNull()
  })

  it("baris released parsial: tiga angka passthrough + releasedBy nama + reason apa adanya", async () => {
    mocks.prismaMock.workOrder.findUnique
      .mockResolvedValueOnce({ id: 9 })
      .mockResolvedValueOnce({ startDate: new Date(), endDate: null, items: [] })
    mocks.prismaMock.stockReservation.findMany.mockResolvedValue([
      {
        id: 5, itemId: 10, warehouseId: 3, workOrderItemId: 41,
        qtyReserved: new Prisma.Decimal("10.00"), qtyConsumed: new Prisma.Decimal("4.00"),
        status: "released", expiresAt: null, releasedAt: new Date(2026, 9, 22),
        releasedBy: 7, releaseReason: "Perintah kerja selesai",
      },
    ])
    mocks.prismaMock.item.findMany.mockResolvedValue([{ id: 10, name: "Oli", defaultWarehouseId: 3 }])
    mocks.prismaMock.warehouse.findMany.mockResolvedValue([{ id: 3, name: "Gudang A" }])
    mocks.prismaMock.user.findMany.mockResolvedValue([{ id: 7, name: "Budi" }])

    const r = await getWorkOrderReservations(9)
    expect(r?.rows).toHaveLength(1)
    expect(r?.rows[0]).toMatchObject({
      itemName: "Oli",
      warehouseName: "Gudang A",
      qtyReserved: 10,
      qtyConsumed: 4,
      remainingQty: 6,
      statusLabel: "Dilepas",
      releasedByName: "Budi",
      releaseReason: "Perintah kerja selesai",
    })
    expect(r?.unreserved).toEqual([])
  })

  it("AC-RIL-4: baris gudang-belum-ditentukan → unreserved berlabel #437, rows kosong", async () => {
    mocks.prismaMock.workOrder.findUnique
      .mockResolvedValueOnce({ id: 9 })
      .mockResolvedValueOnce({
        startDate: new Date(), endDate: null,
        items: [{ id: 41, itemId: 10, qty: 2, status: "in_progress" }],
      })
    mocks.prismaMock.item.findMany.mockResolvedValue([{ id: 10, name: "Filter", defaultWarehouseId: null }])

    const r = await getWorkOrderReservations(9)
    expect(r?.rows).toEqual([])
    expect(r?.unreserved).toEqual([
      {
        itemName: "Filter",
        remainingQty: 2,
        statusLabel: "Belum direservasi — gudang belum ditentukan",
      },
    ])
  })
})
