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
  it("createCustomerVehicle wraps Vehicle + CustomerVehicle in a single $transaction", async () => {
    mocks.prismaMock.customerVehicle.create.mockResolvedValueOnce({ id: 1 })
    const res = await actions.createCustomerVehicle(fdMap({ customerId: 1, variantId: 1 }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.vehicle.create).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.customerVehicle.create).toHaveBeenCalledTimes(1)
    const txCalls = mocks.prismaMock.$transaction.mock.calls.filter(
      (c: any[]) => typeof c[0] === "function"
    )
    expect(txCalls.length).toBeGreaterThan(0)
  })
  it("createCustomerVehicle surfaces failure (no orphan) when CustomerVehicle.create throws after Vehicle.create", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.customerVehicle.create.mockRejectedValueOnce(new Error("fk fail"))
    const res = await actions.createCustomerVehicle(fdMap({ customerId: 1, variantId: 1 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/fk fail/)
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
  // Bug: customerVehicleId on SalesOrder/SalesInvoice is a non-relation Int
  // column, so the _count guard above silently misses SO/Invoice dependents.
  // A customer-vehicle ONLY linked to a SalesInvoice (no WO/Quotation/Project)
  // passes the guard and gets deleted, orphaning the financial document's
  // vehicle reference. deleteVehicle already guards the same case; this is
  // the missing twin in deleteCustomerVehicle.
  it("deleteCustomerVehicle refuses if linked to a SalesOrder", async () => {
    mocks.prismaMock.customerVehicle.findUniqueOrThrow.mockResolvedValue({
      id: 1, customerId: 1, _count: { workOrders: 0, quotations: 0, projects: 0 }
    })
    mocks.prismaMock.salesOrder.count.mockResolvedValueOnce(1)
    mocks.prismaMock.salesInvoice.count.mockResolvedValueOnce(0)
    const res = await actions.deleteCustomerVehicle(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("dokumen terkait")
    expect(mocks.prismaMock.customerVehicle.delete).not.toHaveBeenCalled()
  })
  it("deleteCustomerVehicle refuses if linked to a SalesInvoice", async () => {
    mocks.prismaMock.customerVehicle.findUniqueOrThrow.mockResolvedValue({
      id: 1, customerId: 1, _count: { workOrders: 0, quotations: 0, projects: 0 }
    })
    mocks.prismaMock.salesOrder.count.mockResolvedValueOnce(0)
    mocks.prismaMock.salesInvoice.count.mockResolvedValueOnce(1)
    const res = await actions.deleteCustomerVehicle(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("dokumen terkait")
    expect(mocks.prismaMock.customerVehicle.delete).not.toHaveBeenCalled()
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

  it("createVehicle wraps Vehicle + CustomerVehicle in a single $transaction (no orphan risk)", async () => {
    // The $transaction mock invokes the callback with the prisma mock, so any
    // tx.vehicle.create / tx.customerVehicle.create call proves the atomic
    // wrapper is in place. Without it, the function would call prisma.vehicle
    // .create / prisma.customerVehicle.create directly and a partial failure
    // would orphan a Vehicle row.
    mocks.prismaMock.customerVehicle.create.mockResolvedValueOnce({ id: 1 })
    const res = await actions.createVehicle(fdMap({ plateNo: "B1234XYZ", variantId: 1, modelId: 1, customerId: 5 }))
    expect(res?.success).toBe(true)
    // Inside-tx calls routed through the prisma mock (which IS the tx mock here).
    expect(mocks.prismaMock.vehicle.create).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.customerVehicle.create).toHaveBeenCalledTimes(1)
    // $transaction must be invoked (function form, not array form) to wrap the pair.
    const txCalls = mocks.prismaMock.$transaction.mock.calls.filter(
      (c: any[]) => typeof c[0] === "function"
    )
    expect(txCalls.length).toBeGreaterThan(0)
  })

  it("createVehicle rolls back Vehicle when CustomerVehicle.create throws inside the tx", async () => {
    mocks.prismaMock.customerVehicle.create.mockRejectedValueOnce(new Error("fk fail"))
    const res = await actions.createVehicle(fdMap({ plateNo: "B1234XYZ", variantId: 1, modelId: 1, customerId: 5 }))
    // The $transaction mock propagates the rejection as a rejection of the
    // whole callback (it's not a real DB tx that would auto-rollback), so the
    // outer catch turns it into success: false. Crucially, vehicle.create
    // was attempted (then "rolled back" by the rejected tx) — but no commit
    // happens. The test asserts the function surfaces the failure rather than
    // returning success with an orphan Vehicle.
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/fk fail/)
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

describe("Vehicle Actions Remaining Branches", () => {
  it("createVehicleBrand fails validation (empty name, line 24)", async () => {
    const res = await actions.createVehicleBrand(fdMap({ name: "" }))
    expect(res?.success).toBe(false)
  })
  it("createVehicleModel fails if duplicate name (line 57)", async () => {
    mocks.prismaMock.vehicleModel.findFirst.mockResolvedValueOnce({ id: 2 })
    const res = await actions.createVehicleModel(fdMap({ name: "Avanza", brandId: 1 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("sudah ada")
  })
  it("createVehicle uses existing fallback variant (line 99 branch)", async () => {
    mocks.prismaMock.vehicleVariant.findFirst.mockResolvedValueOnce({ id: 42 })
    const res = await actions.createVehicle(fdMap({ plateNo: "B1234XYZ", modelId: 1 }))
    expect(res?.success).toBe(true)
  })
  it("deleteVehicleVariant revalidates when variant exists (line 217 branch)", async () => {
    mocks.prismaMock.vehicleVariant.findUnique.mockResolvedValueOnce({ id: 1, vehicleModelId: 3 })
    const res = await actions.deleteVehicleVariant(1)
    expect(res?.success).toBe(true)
  })
})

describe("Next.js redirect error handling", () => {
  const redirectErr = new Error("redirect")
  ;(redirectErr as unknown as { digest: string }).digest = "NEXT_REDIRECT_TEST"

  const fnsToTest = [
    { name: "createVehicleBrand", fn: () => actions.createVehicleBrand(fdMap({ name: "Toyota" })) },
    { name: "createVehicleModel", fn: () => actions.createVehicleModel(fdMap({ name: "Avanza", brandId: 1 })) },
    { name: "createVehicle", fn: () => actions.createVehicle(fdMap({ plateNo: "B1234XYZ", variantId: 1, modelId: 1 })) },
    { name: "deleteVehicleBrand", fn: () => actions.deleteVehicleBrand(1) },
    { name: "deleteVehicleModel", fn: () => actions.deleteVehicleModel(1) },
    { name: "createVehicleVariant", fn: () => actions.createVehicleVariant(fdMap({ name: "1.5 G", modelId: 1 })) },
    { name: "deleteVehicleVariant", fn: () => actions.deleteVehicleVariant(1) },
    { name: "updateVehicleBrand", fn: () => actions.updateVehicleBrand(1, fdMap({ name: "Toyota" })) },
    { name: "updateVehicleModel", fn: () => actions.updateVehicleModel(1, fdMap({ name: "Avanza", brandId: 1 })) },
    { name: "updateVehicle", fn: () => actions.updateVehicle(1, fdMap({ plateNo: "B1234XYZ", variantId: 1, modelId: 1 })) },
    { name: "deleteVehicle", fn: () => actions.deleteVehicle(1) },
    { name: "createCustomerVehicle", fn: () => actions.createCustomerVehicle(fdMap({ customerId: 1, variantId: 1, vehicleId: 1 })) },
    { name: "updateCustomerVehicle", fn: () => actions.updateCustomerVehicle(1, fdMap({ customerId: 1, variantId: 1, vehicleId: 1 })) },
    { name: "deleteCustomerVehicle", fn: () => actions.deleteCustomerVehicle(1) },
  ]

  it("should rethrow NEXT_REDIRECT errors", async () => {
    mocks.requirePermissionMock.mockRejectedValue(redirectErr)

    for (const { fn } of fnsToTest) {
      await expect(fn()).rejects.toThrow(redirectErr)
    }
  })
})
