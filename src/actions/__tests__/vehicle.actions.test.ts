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
    salesOrder: buildModelMock(),
    salesInvoice: buildModelMock(),

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
  it("createCustomerVehicle fails validation", async () => {
    const res = await actions.createCustomerVehicle(fdMap({}))
    expect(res?.success).toBe(false)
  })
  it("createCustomerVehicle handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.customerVehicle.create.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.createCustomerVehicle(fdMap({ customerId: 1, variantId: 1, vehicleId: 1 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("createCustomerVehicle fails without vehicleId (line 428-432 branch)", async () => {
    const res = await actions.createCustomerVehicle(fdMap({ customerId: 1 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("vehicleId")
  })
  it("createCustomerVehicle uses formVehicleId", async () => {
    const res = await actions.createCustomerVehicle(fdMap({ customerId: 1, vehicleId: 5 }))
    expect(res?.success).toBe(true)
  })
  it("createCustomerVehicle uses kendaraanId (alias)", async () => {
    const res = await actions.createCustomerVehicle(fdMap({ customerId: 1, kendaraanId: 7 }))
    expect(res?.success).toBe(true)
  })
  it("updateCustomerVehicle succeeds", async () => {
    const res = await actions.updateCustomerVehicle(1, fdMap({ customerId: 1, variantId: 1, vehicleId: 1 }))
    expect(res?.success).toBe(true)
  })
  it("updateCustomerVehicle fails validation", async () => {
    const res = await actions.updateCustomerVehicle(1, fdMap({}))
    expect(res?.success).toBe(false)
  })
  it("updateCustomerVehicle handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.customerVehicle.update.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.updateCustomerVehicle(1, fdMap({ customerId: 1, variantId: 1, vehicleId: 1 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
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
  it("updateCustomerVehicle fails without vehicleId (line 502-506 branch)", async () => {
    mocks.prismaMock.customerVehicle.findUniqueOrThrow.mockResolvedValue({ id: 1, customerId: 1, vehicleId: 1 })
    const res = await actions.updateCustomerVehicle(1, fdMap({ customerId: 1 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("vehicleId")
  })
  it("updateCustomerVehicle uses vehicleId (passed)", async () => {
    mocks.prismaMock.customerVehicle.findUniqueOrThrow.mockResolvedValue({ id: 1, customerId: 1, vehicleId: 1 })
    const res = await actions.updateCustomerVehicle(1, fdMap({ customerId: 1, vehicleId: 5 }))
    expect(res?.success).toBe(true)
  })
  it("updateCustomerVehicle uses kendaraanId (alias)", async () => {
    mocks.prismaMock.customerVehicle.findUniqueOrThrow.mockResolvedValue({ id: 1, customerId: 1, vehicleId: 1 })
    const res = await actions.updateCustomerVehicle(1, fdMap({ customerId: 1, kendaraanId: 7 }))
    expect(res?.success).toBe(true)
  })
  it("deleteCustomerVehicle fails if has dependents", async () => {
    mocks.prismaMock.customerVehicle.findUniqueOrThrow.mockResolvedValue({
      id: 1, customerId: 1, _count: { workOrders: 1, quotations: 0, projects: 0 }
    })
    const res = await actions.deleteCustomerVehicle(1)
    expect(res?.success).toBe(false)
  })
  it("deleteCustomerVehicle fails if not found", async () => {
    mocks.prismaMock.customerVehicle.findUniqueOrThrow.mockResolvedValue(null)
    const res = await actions.deleteCustomerVehicle(1)
    expect(res?.success).toBe(false)
  })
  it("deleteCustomerVehicle handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.customerVehicle.findUniqueOrThrow.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.deleteCustomerVehicle(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
})

describe("Vehicle Actions Error Paths", () => {
  it("createVehicleBrand handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.vehicleBrand.create.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.createVehicleBrand(fdMap({ name: "X" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("updateVehicleBrand fails validation", async () => {
    const res = await actions.updateVehicleBrand(1, fdMap({ name: "" }))
    expect(res?.success).toBe(false)
  })
  it("updateVehicleBrand handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.vehicleBrand.update.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.updateVehicleBrand(1, fdMap({ name: "Toyota" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("deleteVehicleBrand handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.vehicleBrand.delete.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.deleteVehicleBrand(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("createVehicleModel fails validation", async () => {
    const res = await actions.createVehicleModel(fdMap({ name: "" }))
    expect(res?.success).toBe(false)
  })
  it("createVehicleModel handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.vehicleModel.create.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.createVehicleModel(fdMap({ name: "Avanza", brandId: 1 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("updateVehicleModel fails if duplicate name", async () => {
    mocks.prismaMock.vehicleModel.findFirst.mockResolvedValueOnce({ id: 2 })
    const res = await actions.updateVehicleModel(1, fdMap({ name: "Avanza", brandId: 1 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("sudah ada")
  })
  it("updateVehicle finds fallback variant if variantId missing (line 298-302 branch)", async () => {
    mocks.prismaMock.vehicleVariant.findFirst.mockResolvedValueOnce({ id: 5 })
    const res = await actions.updateVehicle(1, fdMap({ plateNo: "B1234XYZ", modelId: 1 }))
    expect(res?.success).toBe(true)
  })
  it("createVehicle creates 'Standard' variant when no variant found (line 101-104 branch)", async () => {
    mocks.prismaMock.vehicleVariant.findFirst.mockResolvedValueOnce(null)
    mocks.prismaMock.vehicleVariant.create.mockResolvedValueOnce({ id: 99 })
    const res = await actions.createVehicle(fdMap({ plateNo: "B1234XYZ", modelId: 1 }))
    expect(res?.success).toBe(true)
  })
  it("createVehicle links to customer when customerId provided (line 123 branch)", async () => {
    mocks.prismaMock.customerVehicle.create.mockResolvedValueOnce({ id: 1 })
    const res = await actions.createVehicle(fdMap({ plateNo: "B1234XYZ", variantId: 1, modelId: 1, customerId: 5 }))
    expect(res?.success).toBe(true)
  })
  it("createVehicleVariant fails if duplicate name (line 187 branch)", async () => {
    mocks.prismaMock.vehicleVariant.findFirst.mockResolvedValueOnce({ id: 2 })
    const res = await actions.createVehicleVariant(fdMap({ name: "1.5 G", modelId: 1 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("sudah ada")
  })
  it("updateVehicleModel fails validation (empty name)", async () => {
    const res = await actions.updateVehicleModel(1, fdMap({ name: "" }))
    expect(res?.success).toBe(false)
  })
  it("updateVehicleModel handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.vehicleModel.update.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.updateVehicleModel(1, fdMap({ name: "Avanza", brandId: 1 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("deleteVehicleModel handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.vehicleModel.delete.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.deleteVehicleModel(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("createVehicleVariant fails validation", async () => {
    const res = await actions.createVehicleVariant(fdMap({ name: "" }))
    expect(res?.success).toBe(false)
  })
  it("createVehicleVariant handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.vehicleVariant.create.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.createVehicleVariant(fdMap({ name: "1.5 G", modelId: 1 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("deleteVehicleVariant handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.vehicleVariant.findUnique.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.deleteVehicleVariant(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("createVehicle fails validation", async () => {
    const res = await actions.createVehicle(fdMap({ plateNo: "" }))
    expect(res?.success).toBe(false)
  })
  it("createVehicle handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.vehicle.create.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.createVehicle(fdMap({ plateNo: "B1234XYZ", variantId: 1, modelId: 1 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("updateVehicle fails validation", async () => {
    const res = await actions.updateVehicle(1, fdMap({ plateNo: "" }))
    expect(res?.success).toBe(false)
  })
  it("updateVehicle handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.vehicle.update.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.updateVehicle(1, fdMap({ plateNo: "B1234XYZ", variantId: 1, modelId: 1 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("deleteVehicle refuses if has relation dependents (line 345 branch)", async () => {
    mocks.prismaMock.customerVehicle.findMany.mockResolvedValue([{ id: 1, _count: { workOrders: 1, quotations: 0, projects: 0 } }])
    const res = await actions.deleteVehicle(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("dokumen terkait")
  })
  it("deleteVehicle refuses if has sales dependents (line 360-364 branch)", async () => {
    mocks.prismaMock.customerVehicle.findMany.mockResolvedValue([{ id: 1, _count: { workOrders: 0, quotations: 0, projects: 0 } }])
    mocks.prismaMock.salesOrder.count.mockResolvedValueOnce(1)
    mocks.prismaMock.salesInvoice.count.mockResolvedValueOnce(1)
    const res = await actions.deleteVehicle(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("dokumen terkait")
  })
  it("deleteVehicle deletes when no dependents", async () => {
    mocks.prismaMock.customerVehicle.findMany.mockResolvedValue([])
    const res = await actions.deleteVehicle(1)
    expect(res?.success).toBe(true)
  })
  it("deleteVehicle handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.customerVehicle.findMany.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.deleteVehicle(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
})
