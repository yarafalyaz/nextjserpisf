import { describe, it, expect, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePermissionMock: vi.fn(),
  prisma: {
    product: {
      count: vi.fn(),
    },
    vehicleBrand: {
      delete: vi.fn(),
    },
    vehicleModel: {
      delete: vi.fn(),
    },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { deleteVehicleBrand, deleteVehicleModel } from "../vehicle.actions"

describe("deleteVehicleBrand / deleteVehicleModel — in-use guard", () => {
  it("deleteVehicleBrand refuses when products reference the brand", async () => {
    mocks.prisma.product.count.mockResolvedValueOnce(3)
    const res = await deleteVehicleBrand(1)
    expect(res.success).toBe(false)
    expect(String(res.error)).toMatch(/merek/i)
    expect(String(res.error)).toMatch(/produk|product/i)
    expect(mocks.prisma.vehicleBrand.delete).not.toHaveBeenCalled()
  })

  it("deleteVehicleBrand deletes when 0 products reference it", async () => {
    mocks.prisma.product.count.mockResolvedValueOnce(0)
    mocks.prisma.vehicleBrand.delete.mockResolvedValueOnce({} as never)
    const res = await deleteVehicleBrand(1)
    expect(res.success).toBe(true)
    expect(mocks.prisma.vehicleBrand.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })

  it("deleteVehicleModel refuses when products reference the model", async () => {
    mocks.prisma.product.count.mockResolvedValueOnce(2)
    const res = await deleteVehicleModel(1)
    expect(res.success).toBe(false)
    expect(String(res.error)).toMatch(/model/i)
    expect(String(res.error)).toMatch(/produk|product/i)
    expect(mocks.prisma.vehicleModel.delete).not.toHaveBeenCalled()
  })

  it("deleteVehicleModel deletes when 0 products reference it", async () => {
    mocks.prisma.product.count.mockResolvedValueOnce(0)
    mocks.prisma.vehicleModel.delete.mockResolvedValueOnce({} as never)
    const res = await deleteVehicleModel(1)
    expect(res.success).toBe(true)
    expect(mocks.prisma.vehicleModel.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })
})
