import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePermissionMock: vi.fn(),
  prisma: {
    vehicleFitmentRule: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
    productMaterial: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import {
  createVehicleFitment,
  updateVehicleFitment,
  deleteVehicleFitment,
  checkVehicleFitment,
} from "../vehicle-fitment.actions"

function fdMap(payload: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(payload)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
})

describe("createVehicleFitment", () => {
  it("creates a rule scoped to the given item and configuration", async () => {
    mocks.prisma.vehicleFitmentRule.create.mockResolvedValue({ id: 9 })
    const res = await createVehicleFitment(fdMap({
      itemId: "5",
      vehicleBrandId: "1",
      vehicleModelId: "2",
      vehicleVariantId: "3",
      yearFrom: "2015",
      yearTo: "2020",
      drivetrain: "4WD",
      result: "compatible",
      source: "katalog pabrikan",
    }))
    expect(res.success).toBe(true)
    expect(res.id).toBe(9)
    expect(mocks.prisma.vehicleFitmentRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          itemId: 5,
          vehicleBrandId: 1,
          vehicleModelId: 2,
          vehicleVariantId: 3,
          yearFrom: 2015,
          yearTo: 2020,
          drivetrain: "4WD",
          result: "compatible",
          createdBy: 1,
        }),
      }),
    )
  })

  it("rejects yearFrom > yearTo", async () => {
    const res = await createVehicleFitment(fdMap({
      itemId: "5",
      yearFrom: "2020",
      yearTo: "2010",
      result: "compatible",
    }))
    expect(res.success).toBe(false)
    expect(String(res.error)).toMatch(/tahun/i)
    expect(mocks.prisma.vehicleFitmentRule.create).not.toHaveBeenCalled()
  })

  it("defaults result to unknown when omitted", async () => {
    mocks.prisma.vehicleFitmentRule.create.mockResolvedValue({ id: 10 })
    await createVehicleFitment(fdMap({ itemId: "5" }))
    expect(mocks.prisma.vehicleFitmentRule.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ result: "unknown" }) }),
    )
  })
})

describe("updateVehicleFitment", () => {
  it("updates a rule", async () => {
    mocks.prisma.vehicleFitmentRule.update.mockResolvedValue({ id: 9 })
    const res = await updateVehicleFitment(9, fdMap({
      itemId: "5",
      result: "incompatible",
      isActive: "true",
    }))
    expect(res.success).toBe(true)
    expect(mocks.prisma.vehicleFitmentRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 9 },
        data: expect.objectContaining({ result: "incompatible", isActive: true }),
      }),
    )
  })
})

describe("deleteVehicleFitment", () => {
  it("deletes the rule", async () => {
    mocks.prisma.vehicleFitmentRule.delete.mockResolvedValue({})
    const res = await deleteVehicleFitment(9)
    expect(res.success).toBe(true)
    expect(mocks.prisma.vehicleFitmentRule.delete).toHaveBeenCalledWith({ where: { id: 9 } })
  })
})

describe("checkVehicleFitment", () => {
  it("evaluates a single item", async () => {
    mocks.prisma.vehicleFitmentRule.findMany.mockResolvedValue([
      {
        id: 1, itemId: 5, bomRevisionId: null,
        vehicleBrandId: null, vehicleModelId: 2, vehicleVariantId: null,
        yearFrom: null, yearTo: null, drivetrain: null, transmission: null,
        result: "compatible", source: "katalog", notes: null,
      },
    ])
    const res = await checkVehicleFitment(fdMap({ itemId: "5", vehicleModelId: "2" }))
    expect(res.success).toBe(true)
    expect(res.mode).toBe("item")
    expect((res as { evaluation: { result: string } }).evaluation.result).toBe("compatible")
  })

  it("evaluates a product's material lines", async () => {
    mocks.prisma.productMaterial.findMany.mockResolvedValue([{ itemId: 5 }])
    mocks.prisma.vehicleFitmentRule.findMany.mockResolvedValue([])
    const res = await checkVehicleFitment(fdMap({ productId: "100", vehicleModelId: "2" }))
    expect(res.success).toBe(true)
    expect(res.mode).toBe("product")
    expect((res as { lines: unknown[] }).lines).toHaveLength(1)
  })

  it("requires a product or item", async () => {
    const res = await checkVehicleFitment(fdMap({ vehicleModelId: "2" }))
    expect(res.success).toBe(false)
  })
})
