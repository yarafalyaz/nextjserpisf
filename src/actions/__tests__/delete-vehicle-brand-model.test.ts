import { describe, it, expect, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePermissionMock: vi.fn(),
  execRaw: vi.fn().mockResolvedValue(1),
  txCount: vi.fn().mockResolvedValue(0),
  prisma: {
    product: {
      count: vi.fn(),
    },
    vehicleFitmentRule: {
      count: vi.fn(),
    },
    vehicleBrand: {
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    vehicleModel: {
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    vehicleVariant: {
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    vehicle: {
      count: vi.fn(),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(),
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

// Putaran 74: hitungan guard berjalan dalam tx berkunci; harness
// menyatukan facade tx dengan prisma mock itu sendiri.
mocks.prisma.$transaction.mockImplementation(async (cb: any) => cb(mocks.prisma))

import { deleteVehicleBrand, deleteVehicleModel, deleteVehicleVariant } from "../vehicle.actions"

describe("deleteVehicleBrand / deleteVehicleModel — in-use guard", () => {
  // Putaran 74 wiring: hitungan guard kini berjalan dalam tx berkunci;
  // facade tx = mocks.prisma itu sendiri, jadi hitungan lama (mock
  // langsung pada count model) tetap menggerbangi jalur terkunci.

  it("putaran 74: hitungan dalam tx berkunci menolak delete konkuren (bacaan pra-tx nol)", async () => {
    // Gembok delegate tx: produkT.count (dipakai produksi lewat tx) = 3
    // sesudah kunci; kode lama hanya membaca global maka test merah atas
    // implementasi pra-putaran-74.
    mocks.prisma.product.count.mockResolvedValueOnce(3)
    mocks.prisma.vehicleFitmentRule.count.mockResolvedValueOnce(0)
    const res = await deleteVehicleBrand(1)
    expect(res.success).toBe(false)
    expect(mocks.prisma.vehicleBrand.delete).not.toHaveBeenCalled()
  })

  it("putaran 74: deleteVehicleVariant menolak dari hitungan terkunci", async () => {
    mocks.prisma.vehicle.count.mockResolvedValueOnce(0)
    mocks.prisma.vehicleFitmentRule.count.mockResolvedValueOnce(1)
    const res = await deleteVehicleVariant(1)
    expect(res.success).toBe(false)
    expect(mocks.prisma.vehicleVariant.delete).not.toHaveBeenCalled()
  })


  it("deleteVehicleBrand refuses when products reference the brand", async () => {
    mocks.prisma.product.count.mockResolvedValueOnce(3)
    mocks.prisma.vehicleFitmentRule.count.mockResolvedValueOnce(0)
    const res = await deleteVehicleBrand(1)
    expect(res.success).toBe(false)
    expect(String(res.error)).toMatch(/merek/i)
    expect(String(res.error)).toMatch(/produk|product/i)
    expect(mocks.prisma.vehicleBrand.delete).not.toHaveBeenCalled()
  })

  it("deleteVehicleBrand refuses when only fitment rules reference the brand", async () => {
    mocks.prisma.product.count.mockResolvedValueOnce(0)
    mocks.prisma.vehicleFitmentRule.count.mockResolvedValueOnce(2)
    const res = await deleteVehicleBrand(1)
    expect(res.success).toBe(false)
    expect(String(res.error)).toMatch(/aturan kompatibilitas: 2/)
    expect(mocks.prisma.vehicleBrand.delete).not.toHaveBeenCalled()
  })

  it("deleteVehicleBrand deletes when 0 products reference it", async () => {
    mocks.prisma.product.count.mockResolvedValueOnce(0)
    mocks.prisma.vehicleFitmentRule.count.mockResolvedValueOnce(0)
    mocks.prisma.vehicleBrand.delete.mockResolvedValueOnce({} as never)
    const res = await deleteVehicleBrand(1)
    expect(res.success).toBe(true)
    expect(mocks.prisma.vehicleBrand.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })

  it("deleteVehicleModel refuses when products reference the model", async () => {
    mocks.prisma.product.count.mockResolvedValueOnce(2)
    mocks.prisma.vehicleFitmentRule.count.mockResolvedValueOnce(0)
    const res = await deleteVehicleModel(1)
    expect(res.success).toBe(false)
    expect(String(res.error)).toMatch(/model/i)
    expect(String(res.error)).toMatch(/produk|product/i)
    expect(mocks.prisma.vehicleModel.delete).not.toHaveBeenCalled()
  })

  it("deleteVehicleModel refuses when only fitment rules reference the model", async () => {
    mocks.prisma.product.count.mockResolvedValueOnce(0)
    mocks.prisma.vehicleFitmentRule.count.mockResolvedValueOnce(1)
    const res = await deleteVehicleModel(1)
    expect(res.success).toBe(false)
    expect(String(res.error)).toMatch(/aturan kompatibilitas: 1/)
    expect(mocks.prisma.vehicleModel.delete).not.toHaveBeenCalled()
  })

  it("deleteVehicleModel deletes when 0 products reference it", async () => {
    mocks.prisma.product.count.mockResolvedValueOnce(0)
    mocks.prisma.vehicleFitmentRule.count.mockResolvedValueOnce(0)
    mocks.prisma.vehicleModel.delete.mockResolvedValueOnce({} as never)
    const res = await deleteVehicleModel(1)
    expect(res.success).toBe(true)
    expect(mocks.prisma.vehicleModel.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })
})
