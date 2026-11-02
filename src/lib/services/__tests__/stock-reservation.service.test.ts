import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"

/**
 * F-2026-10-21-012 inti service (AC-RES-2/5/8): isolasi konsumsi MI per WO
 * pemilik+gudang sama, lazy-expire idempoten, lepas baris replaced.
 * Tx dimock — yang dijaga rujukan query (workOrderId pemilik + warehouseId),
 * bukan DB asli.
 */

const findFirstMock = vi.fn()
const findManyMock = vi.fn()
const updateMock = vi.fn()
const updateManyMock = vi.fn()
const queryRawMock = vi.fn()
const executeRawMock = vi.fn()

function txMock() {
  return {
    $queryRaw: queryRawMock,
    $executeRaw: executeRawMock,
    stockReservation: {
      findFirst: findFirstMock,
      findMany: findManyMock,
      update: updateMock,
      updateMany: updateManyMock,
    },
  } as never
}

import {
  consumeReservationsForMaterialIssueTx,
  createReservationsForWorkOrderStartTx,
  expireOverdueReservationsTx,
  reduceReservationsForWorkOrderItemTx,
  releaseActiveReservationsForWorkOrderTx,
  releaseReservationsForReplacedItemsTx,
} from "../stock-reservation.service"

beforeEach(() => {
  vi.clearAllMocks()
  updateMock.mockResolvedValue({})
  updateManyMock.mockResolvedValue({ count: 1 })
  queryRawMock.mockResolvedValue([{ id: 3 }])
  executeRawMock.mockReset().mockResolvedValue(0)
})

describe("consumeReservationsForMaterialIssueTx", () => {
  it("AC-RES-2: MI tanpa WO → semua tanpa cadangan, query reservasi TIDAK dipanggil", async () => {
    const out = await consumeReservationsForMaterialIssueTx(txMock(), {
      workOrderId: null,
      warehouseId: 5,
      items: [{ itemId: 10, qty: 2 }],
    })
    expect(findFirstMock).not.toHaveBeenCalled()
    expect(out.get(10)).toBe(2)
  })

  it("AC-RES-2: query dibatasi WO pemilik + gudang MI + status active", async () => {
    findManyMock.mockResolvedValue([])
    await consumeReservationsForMaterialIssueTx(txMock(), {
      workOrderId: 9,
      warehouseId: 5,
      items: [{ itemId: 10, qty: 1 }],
    })
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workOrderId: 9, itemId: 10, warehouseId: 5, status: "active" },
      }),
    )
  })

  it("AC-RES-3: qty melebihi sisa → consumed penuh, kelebihan tanpa cadangan", async () => {
    findManyMock.mockResolvedValue([{
      id: 3,
      qtyReserved: new Prisma.Decimal("2.00"),
      qtyConsumed: new Prisma.Decimal("0.00"),
    }])
    const out = await consumeReservationsForMaterialIssueTx(txMock(), {
      workOrderId: 9,
      warehouseId: 5,
      items: [{ itemId: 10, qty: 5 }],
    })
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 3 },
        data: expect.objectContaining({ status: "consumed" }),
      }),
    )
    expect(Number(updateMock.mock.calls[0][0].data.qtyConsumed)).toBe(2)
    expect(out.get(10)).toBe(3)
  })

  it("mengunci baris reservasi aktif sebelum membacanya (serial dua MI satu WO)", async () => {
    findManyMock.mockResolvedValue([{
      id: 3,
      qtyReserved: new Prisma.Decimal("10.00"),
      qtyConsumed: new Prisma.Decimal("0.00"),
    }])
    await consumeReservationsForMaterialIssueTx(txMock(), {
      workOrderId: 9,
      warehouseId: 5,
      items: [{ itemId: 10, qty: 4 }],
    })
    const sqlOf = (c: unknown[]) => {
      const a = c[0] as { sql?: string; strings?: string[] } | string[]
      return Array.isArray(a) ? a.join("?") : (a?.sql ?? a?.strings?.join("?") ?? "")
    }
    const lockIdx = queryRawMock.mock.calls.findIndex((c) => sqlOf(c).includes("stock_reservations"))
    expect(lockIdx).toBeGreaterThanOrEqual(0)
    expect(sqlOf(queryRawMock.mock.calls[lockIdx])).toContain("FOR UPDATE")
    expect(queryRawMock.mock.invocationCallOrder[lockIdx]).toBeLessThan(
      findManyMock.mock.invocationCallOrder[0],
    )
  })

  it("STOK-07: dua reservasi aktif 6+6, MI 10 -> konsumsi 6 dan 4, tanpa sisa unreserved", async () => {
    findManyMock.mockResolvedValue([
      { id: 3, qtyReserved: new Prisma.Decimal("6.00"), qtyConsumed: new Prisma.Decimal("0.00") },
      { id: 4, qtyReserved: new Prisma.Decimal("6.00"), qtyConsumed: new Prisma.Decimal("0.00") },
    ])
    const out = await consumeReservationsForMaterialIssueTx(txMock(), {
      workOrderId: 9,
      warehouseId: 5,
      items: [{ itemId: 10, qty: 10 }],
    })
    expect(updateMock).toHaveBeenCalledTimes(2)
    expect(Number(updateMock.mock.calls[0][0].data.qtyConsumed)).toBe(6)
    expect(updateMock.mock.calls[0][0].data.status).toBe("consumed")
    expect(Number(updateMock.mock.calls[1][0].data.qtyConsumed)).toBe(4)
    expect(out.get(10)).toBeUndefined()
  })
})

describe("createReservationsForWorkOrderStartTx (BUGHUNT r3: ketersediaan batch)", () => {
  function baseTx(overrides: {
    items: { id: number; itemId: number; qty: number; status: string }[]
    orderReservationRows?: (...args: unknown[]) => Promise<unknown>
  }) {
    return {
      workOrder: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: 9,
          startDate: new Date(2026, 9, 22),
          endDate: null,
          createdAt: new Date(),
          items: overrides.items,
        })),
      },
      materialIssue: { findFirst: vi.fn(async () => ({ warehouseId: 5 })) },
      item: {
        findMany: vi.fn(async () =>
          overrides.items.map((i) => ({ id: i.itemId, defaultWarehouseId: null })),
        ),
      },
      materialIssueItem: { findMany: vi.fn(async () => []) },
      inventoryLayer: {
        aggregate: vi.fn(),
        groupBy: vi.fn(async () => [
          { itemId: 1, warehouseId: 5, _sum: { remaining: 100 } },
        ]),
      },
      $queryRaw: queryRawMock,
      $executeRaw: executeRawMock,
    }
  }

  it("regresi putaran 15: kunci items terurut + reservasi lawan dibaca LOCKING sesudah kunci", async () => {
    const sqlOf = (c: unknown[]) => {
      const a = c[0] as { sql?: string; strings?: string[] } | string[]
      return Array.isArray(a) ? a.join("?") : (a?.sql ?? a?.strings?.join("?") ?? "")
    }
    let reservationFindCalls = 0
    findManyMock.mockImplementation(async () => {
      reservationFindCalls += 1
      if (reservationFindCalls < 3) return []
      return [{
        itemId: 1,
        warehouseId: 5,
        qtyReserved: new Prisma.Decimal("80.00"),
        qtyConsumed: new Prisma.Decimal("0.00"),
      }]
    })
    const createMock = vi.fn(async (a: unknown) => a)
    const tx = {
      ...baseTx({ items: [{ id: 41, itemId: 1, qty: 80, status: "pending" }] }),
      stockReservation: { findMany: findManyMock, create: createMock },
    } as never

    const out = await createReservationsForWorkOrderStartTx(tx, { workOrderId: 9, createdBy: 7 })

    expect(out.created).toBe(1)
    expect(Number((createMock.mock.calls[0][0] as { data: { qtyReserved: unknown } }).data.qtyReserved)).toBe(20)
    expect(Number((createMock.mock.calls[0][0] as { data: { shortageQty: unknown } }).data.shortageQty)).toBe(60)

    const itemLockIdx = queryRawMock.mock.calls.findIndex((c) => sqlOf(c).includes("FROM items"))
    expect(itemLockIdx).toBeGreaterThanOrEqual(0)
    expect(sqlOf(queryRawMock.mock.calls[itemLockIdx])).toContain("FOR UPDATE")
    expect(queryRawMock.mock.invocationCallOrder[itemLockIdx]).toBeLessThan(
      findManyMock.mock.invocationCallOrder[0],
    )
    expect(executeRawMock.mock.calls).toHaveLength(1)
    const freshLockSql = sqlOf(executeRawMock.mock.calls[0])
    expect(freshLockSql).toContain("stock_reservations")
    expect(freshLockSql).toContain("FOR UPDATE")
    expect(executeRawMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      queryRawMock.mock.invocationCallOrder[itemLockIdx],
    )
  })

  it("itemIds kosong: tidak ada kunci items, tidak ada fresh locking read", async () => {
    findManyMock.mockResolvedValue([])
    const tx = {
      ...baseTx({ items: [{ id: 41, itemId: 1, qty: 0, status: "replaced" }] }),
      stockReservation: { findMany: findManyMock, create: vi.fn() },
    } as never

    await createReservationsForWorkOrderStartTx(tx, { workOrderId: 9, createdBy: 7 })

    expect(queryRawMock).not.toHaveBeenCalled()
    expect(executeRawMock).not.toHaveBeenCalled()
  })

  it("satu groupBy untuk semua pasangan gudang×item; nol aggregate serial; hasil rencana sama dengan per pasangan", async () => {
    const aggregateMock = vi.fn()
    const groupByMock = vi.fn(async () => [
      // (1,5)=10 → item 1 kurang 2 dari 12; pasangan absen (2,5) terbaca 0.
      { itemId: 1, warehouseId: 5, _sum: { remaining: 10 } },
    ])
    const createMock = vi.fn(async (a: unknown) => a)
    const tx = {
      workOrder: {
        findUniqueOrThrow: vi.fn(async () => ({
          id: 9,
          startDate: new Date(2026, 9, 22),
          endDate: null,
          createdAt: new Date(),
          items: [
            { id: 41, itemId: 1, qty: 12, status: "pending" },
            { id: 42, itemId: 2, qty: 4, status: "pending" },
          ],
        })),
      },
      materialIssue: { findFirst: vi.fn(async () => ({ warehouseId: 5 })) },
      item: {
        findMany: vi.fn(async () => [
          { id: 1, defaultWarehouseId: null },
          { id: 2, defaultWarehouseId: null },
        ]),
      },
      materialIssueItem: { findMany: vi.fn(async () => []) },
      stockReservation: { findMany: findManyMock, create: createMock },
      inventoryLayer: { aggregate: aggregateMock, groupBy: groupByMock },
      $queryRaw: queryRawMock,
      $executeRaw: executeRawMock,
    } as never
    findManyMock.mockReset().mockResolvedValue([])

    const out = await createReservationsForWorkOrderStartTx(tx, { workOrderId: 9, createdBy: 7 })

    expect(out.created).toBe(2)
    expect(groupByMock).toHaveBeenCalledTimes(1)
    expect(groupByMock).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["itemId", "warehouseId"],
        where: { itemId: { in: [1, 2] }, warehouseId: { in: [5] }, remaining: { gt: 0 } },
      }),
    )
    expect(aggregateMock).not.toHaveBeenCalled()
    const rows = createMock.mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data)
    expect(rows.find((r) => r.itemId === 1)).toMatchObject({ warehouseId: 5 })
    expect(Number(rows.find((r) => r.itemId === 1)?.qtyReserved)).toBe(10)
    expect(Number(rows.find((r) => r.itemId === 1)?.shortageQty)).toBe(2)
    // Pasangan tanpa baris groupBy = tersedia 0 → reserved 0, shortage penuh.
    expect(Number(rows.find((r) => r.itemId === 2)?.qtyReserved)).toBe(0)
    expect(Number(rows.find((r) => r.itemId === 2)?.shortageQty)).toBe(4)
  })
})

describe("expireOverdueReservationsTx (AC-RES-5)", () => {
  it("hanya baris active lewat expiresAt; idempoten lewat updateMany kondisional", async () => {
    const now = new Date(2026, 9, 22)
    const n = await expireOverdueReservationsTx(txMock(), { now })
    expect(n).toBe(1)
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "active", expiresAt: { not: null, lt: now } }),
        data: { status: "expired" },
      }),
    )
  })
})

describe("releaseReservationsForReplacedItemsTx (AC-RES-8)", () => {
  it("lepas hanya baris aktif milik WO + baris diganti; kosong = no-op", async () => {
    const n = await releaseReservationsForReplacedItemsTx(txMock(), {
      workOrderId: 9,
      workOrderItemIds: [41, 42],
    })
    expect(n).toBe(1)
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workOrderId: 9, workOrderItemId: { in: [41, 42] }, status: "active" },
        data: expect.objectContaining({ status: "released" }),
      }),
    )
    expect(
      await releaseReservationsForReplacedItemsTx(txMock(), { workOrderId: 9, workOrderItemIds: [] }),
    ).toBe(0)
  })
})

describe("reduceReservationsForWorkOrderItemTx (round3 change-order ubah turun)", () => {
  it("turun qty: qtyReserved dipangkas ke consumed + sisa kebutuhan, consumed tak disentuh", async () => {
    findManyMock.mockResolvedValue([
      { id: 3, qtyReserved: new Prisma.Decimal(10), qtyConsumed: new Prisma.Decimal(2) },
    ])
    const n = await reduceReservationsForWorkOrderItemTx(txMock(), {
      workOrderId: 9,
      workOrderItemId: 41,
      newQty: 5,
      releasedBy: 7,
    })
    expect(n).toBe(1)
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workOrderId: 9, workOrderItemId: 41, status: "active" },
      }),
    )
    const arg = updateMock.mock.calls[0][0]
    expect(arg.where).toEqual({ id: 3 })
    expect(Number(arg.data.qtyReserved)).toBe(5)
    expect(arg.data.status).toBeUndefined()
  })

  it("kebutuhan 0 tanpa konsumsi → released dengan jejak", async () => {
    findManyMock.mockResolvedValue([
      { id: 4, qtyReserved: new Prisma.Decimal(4), qtyConsumed: new Prisma.Decimal(0) },
    ])
    const n = await reduceReservationsForWorkOrderItemTx(txMock(), {
      workOrderId: 9,
      workOrderItemId: 41,
      newQty: 0,
      releasedBy: 7,
    })
    expect(n).toBe(1)
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 4 },
        data: expect.objectContaining({ status: "released", releasedBy: 7 }),
      }),
    )
  })

  it("qty baru di bawah consumed → consumed penuh di angka consumed", async () => {
    findManyMock.mockResolvedValue([
      { id: 5, qtyReserved: new Prisma.Decimal(6), qtyConsumed: new Prisma.Decimal(2) },
    ])
    await reduceReservationsForWorkOrderItemTx(txMock(), {
      workOrderId: 9,
      workOrderItemId: 41,
      newQty: 1,
    })
    const arg = updateMock.mock.calls[0][0]
    expect(Number(arg.data.qtyReserved)).toBe(2)
    expect(arg.data.status).toBe("consumed")
  })

  it("naik qty → no-op (reservasi baru hanya lahir di start)", async () => {
    findManyMock.mockResolvedValue([
      { id: 6, qtyReserved: new Prisma.Decimal(5), qtyConsumed: new Prisma.Decimal(0) },
    ])
    const n = await reduceReservationsForWorkOrderItemTx(txMock(), {
      workOrderId: 9,
      workOrderItemId: 41,
      newQty: 20,
    })
    expect(n).toBe(0)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it("putaran 53: baris reservasi dikunci FOR UPDATE sebelum dibaca", async () => {
    findManyMock.mockResolvedValue([
      { id: 3, qtyReserved: new Prisma.Decimal(10), qtyConsumed: new Prisma.Decimal(2) },
    ])
    await reduceReservationsForWorkOrderItemTx(txMock(), {
      workOrderId: 9,
      workOrderItemId: 41,
      newQty: 5,
    })
    // Snapshot REPEATABLE READ terbentuk pada findUnique CO di tx pemanggil
    // SEBELUM lock WO; tanpa locking read, MI konkuren yang commit sesudah
    // lock WO tetap tak terlihat → qtyReserved ditulis di bawah qtyConsumed.
    const sqlOf = (c: unknown[]) => {
      const a = c[0] as { sql?: string; strings?: string[] } | string[]
      return Array.isArray(a) ? a.join("?") : (a?.sql ?? a?.strings?.join("?") ?? "")
    }
    const lockIdx = queryRawMock.mock.calls.findIndex((c) => sqlOf(c).includes("FOR UPDATE"))
    expect(lockIdx, "query kunci FOR UPDATE atas stock_reservations").toBeGreaterThanOrEqual(0)
    const sql = sqlOf(queryRawMock.mock.calls[lockIdx])
    expect(sql).toContain("work_order_item_id")
    expect(sql).toContain("status = 'active'")
  })
})

describe("releaseActiveReservationsForWorkOrderTx (F-057-S rilis per transisi)", () => {
  it("lepas hanya baris active WO ini + jejak releasedBy/reason; return count", async () => {
    updateManyMock.mockResolvedValue({ count: 2 })
    const n = await releaseActiveReservationsForWorkOrderTx(txMock(), {
      workOrderId: 9,
      releasedBy: 7,
      reason: "Perintah kerja selesai",
    })
    expect(n).toBe(2)
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workOrderId: 9, status: "active" },
        data: expect.objectContaining({
          status: "released",
          releasedBy: 7,
          releaseReason: "Perintah kerja selesai",
        }),
      }),
    )
  })

  it("falsifikasi rilis dobel: panggilan kedua menyasar status active yang sudah kosong → count 0 (no-op, tanpa dobel-rilis)", async () => {
    updateManyMock.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 0 })
    const first = await releaseActiveReservationsForWorkOrderTx(txMock(), {
      workOrderId: 9,
      releasedBy: 7,
      reason: "Perintah kerja selesai",
    })
    const second = await releaseActiveReservationsForWorkOrderTx(txMock(), {
      workOrderId: 9,
      releasedBy: 7,
      reason: "Perintah kerja ditutup",
    })
    expect(first).toBe(2)
    expect(second).toBe(0)
    // Penjaga idempoten = filter status active di SETIAP panggilan.
    for (const call of updateManyMock.mock.calls) {
      expect(call[0].where.status).toBe("active")
    }
  })
})
