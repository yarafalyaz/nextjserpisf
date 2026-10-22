import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"

/**
 * F-2026-10-21-012 inti service (AC-RES-2/5/8): isolasi konsumsi MI per WO
 * pemilik+gudang sama, lazy-expire idempoten, lepas baris replaced.
 * Tx dimock — yang dijaga rujukan query (workOrderId pemilik + warehouseId),
 * bukan DB asli.
 */

const findFirstMock = vi.fn()
const updateMock = vi.fn()
const updateManyMock = vi.fn()

function txMock() {
  return {
    stockReservation: {
      findFirst: findFirstMock,
      update: updateMock,
      updateMany: updateManyMock,
    },
  } as never
}

import {
  consumeReservationsForMaterialIssueTx,
  expireOverdueReservationsTx,
  releaseReservationsForReplacedItemsTx,
} from "../stock-reservation.service"

beforeEach(() => {
  vi.clearAllMocks()
  updateMock.mockResolvedValue({})
  updateManyMock.mockResolvedValue({ count: 1 })
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
    findFirstMock.mockResolvedValue(null)
    await consumeReservationsForMaterialIssueTx(txMock(), {
      workOrderId: 9,
      warehouseId: 5,
      items: [{ itemId: 10, qty: 1 }],
    })
    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workOrderId: 9, itemId: 10, warehouseId: 5, status: "active" },
      }),
    )
  })

  it("AC-RES-3: qty melebihi sisa → consumed penuh, kelebihan tanpa cadangan", async () => {
    findFirstMock.mockResolvedValue({
      id: 3,
      qtyReserved: new Prisma.Decimal("2.00"),
      qtyConsumed: new Prisma.Decimal("0.00"),
    })
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
