import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1, name: "Test" }),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    count: vi.fn().mockResolvedValue(0),
  })

  const prismaMock: any = {
    vehicleBrand: buildModelMock(),
    vehicleModel: buildModelMock(),
    vehicleVariant: buildModelMock(),
    vehicle: buildModelMock(),
    customerVehicle: buildModelMock(),

    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(prismaMock)
      return Promise.all(ops)
    }),
  }

  return {
    requirePermissionMock: vi.fn(),
    prismaMock,
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))

import * as actions from "../vehicle.actions"

function fdMap(payload: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) {
    if (v !== null && v !== undefined) f.append(k, String(v))
  }
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
})

describe("Vehicle Brand Actions", () => {
  it("createVehicleBrand succeeds", async () => {
    const res = await actions.createVehicleBrand(fdMap({ name: "Toyota" }))
    expect(res?.success).toBe(true)
  })
  it("updateVehicleBrand succeeds", async () => {
    const res = await actions.updateVehicleBrand(1, fdMap({ name: "Toyota" }))
    expect(res?.success).toBe(true)
  })
  it("deleteVehicleBrand succeeds", async () => {
    const res = await actions.deleteVehicleBrand(1)
    expect(res?.success).toBe(true)
  })
})

describe("Vehicle Model Actions", () => {
  it("createVehicleModel succeeds", async () => {
    const res = await actions.createVehicleModel(fdMap({ name: "Avanza", brandId: 1 }))
    expect(res?.success).toBe(true)
  })
  it("updateVehicleModel succeeds", async () => {
    const res = await actions.updateVehicleModel(1, fdMap({ name: "Avanza", brandId: 1 }))
    expect(res?.success).toBe(true)
  })
  it("deleteVehicleModel succeeds", async () => {
    const res = await actions.deleteVehicleModel(1)
    expect(res?.success).toBe(true)
  })
})

describe("Vehicle Variant Actions", () => {
  it("createVehicleVariant succeeds", async () => {
    const res = await actions.createVehicleVariant(fdMap({ name: "1.5 G", modelId: 1 }))
    expect(res?.success).toBe(true)
  })
  it("deleteVehicleVariant succeeds", async () => {
    const res = await actions.deleteVehicleVariant(1)
    expect(res?.success).toBe(true)
  })
})

describe("Vehicle Actions", () => {
  it("createVehicle succeeds", async () => {
    const res = await actions.createVehicle(fdMap({ plateNo: "B1234XYZ", variantId: 1, modelId: 1 }))
    expect(res?.success).toBe(true)
  })
  it("updateVehicle succeeds", async () => {
    const res = await actions.updateVehicle(1, fdMap({ plateNo: "B1234XYZ", variantId: 1, modelId: 1 }))
    expect(res?.success).toBe(true)
  })
  it("deleteVehicle succeeds", async () => {
    const res = await actions.deleteVehicle(1)
    expect(res?.success).toBe(true)
  })
})

describe("Customer Vehicle Actions", () => {
  it("createCustomerVehicle succeeds", async () => {
    const res = await actions.createCustomerVehicle(fdMap({ customerId: 1, variantId: 1, vehicleId: 1 }))
    expect(res?.success).toBe(true)
  })
  it("updateCustomerVehicle succeeds", async () => {
    const res = await actions.updateCustomerVehicle(1, fdMap({ customerId: 1, variantId: 1, vehicleId: 1 }))
    expect(res?.success).toBe(true)
  })
  it("deleteCustomerVehicle succeeds", async () => {
    mocks.prismaMock.customerVehicle.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      customerId: 1,
      _count: { workOrders: 0, quotations: 0, projects: 0 }
    })
    const res = await actions.deleteCustomerVehicle(1)
    expect(res?.success).toBe(true)
  })
})
