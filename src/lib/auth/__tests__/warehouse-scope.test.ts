import { describe, it, expect, vi, beforeEach } from "vitest"

const findManyMock = vi.fn()

vi.mock("@/lib/db/prisma", () => ({
  prisma: { userWarehouse: { findMany: (...a: unknown[]) => findManyMock(...a) } },
}))

import { getWarehouseScope } from "../warehouse-scope"

describe("getWarehouseScope", () => {
  beforeEach(() => {
    findManyMock.mockReset()
  })

  it("putaran 77: hanya penugasan ke gudang aktif dan belum terhapus yang memberi scope", async () => {
    findManyMock.mockResolvedValue([{ warehouseId: 4 }])

    const scope = await getWarehouseScope({ id: "7", roles: ["warehouse"] })

    expect(findManyMock).toHaveBeenCalledWith({
      where: {
        userId: 7,
        warehouse: { isActive: true, deletedAt: null },
      },
      select: { warehouseId: true },
    })
    expect(scope).toEqual({ kind: "assigned", warehouseIds: [4] })
  })

  it("semua penugasan menunjuk gudang mati menghasilkan scope none", async () => {
    findManyMock.mockResolvedValue([])

    const scope = await getWarehouseScope({ id: "7", roles: ["warehouse"] })

    expect(scope).toEqual({ kind: "none" })
  })
})
