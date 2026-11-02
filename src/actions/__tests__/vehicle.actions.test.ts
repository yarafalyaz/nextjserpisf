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
    product: buildModelMock(),
    vehicleFitmentRule: buildModelMock(),
    salesOrder: buildModelMock(),
    salesInvoice: buildModelMock(),
    customer: buildModelMock(),

    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(prismaMock)
      return Promise.all(ops)
    }),
    $queryRaw: vi.fn().mockResolvedValue([{ id: 1 }]),
    $executeRaw: vi.fn().mockResolvedValue(1),
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
  // Default: FK referensi ada (cek eksistensi create/updateCustomerVehicle).
  // Tes penolakan menimpa dengan mockResolvedValueOnce(null).
  mocks.prismaMock.customer.findFirst.mockResolvedValue({ id: 1 })
  mocks.prismaMock.vehicleVariant.findFirst.mockResolvedValue({ id: 1 })
  mocks.prismaMock.vehicle.findFirst.mockResolvedValue({ id: 1 })
})

describe("Vehicle Brand Actions", () => {
  it("createVehicleBrand succeeds", async () => {
    const res = await actions.createVehicleBrand(fdMap({ name: "Toyota" }))
    expect(res?.success).toBe(true)
  })

  it("putaran 55 K1: createVehicleBrand menolak nama sama (trim+case) yang lahir belakangan", async () => {
    mocks.prismaMock.vehicleBrand.findMany.mockImplementation(async (args: any) => {
      const cond = args?.where?.name as { in?: string[] } | undefined
      if (!cond?.in || cond.in.includes("Toyota")) {
        return [{ id: 9, slug: "toyota", name: "Toyota" }]
      }
      return []
    })
    try {
      const res = await actions.createVehicleBrand(fdMap({ name: "  toyota  " }))
      expect(res?.success).toBe(false)
      expect(res?.error).toContain("sudah ada")
      expect(mocks.prismaMock.vehicleBrand.create).not.toHaveBeenCalled()
    } finally {
      mocks.prismaMock.vehicleBrand.findMany.mockResolvedValue([])
    }
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
    const res = await actions.createVehicleModel(fdMap({ name: "Avanza", vehicleBrandId: 1 }))
    expect(res?.success).toBe(true)
  })

  it("putaran 55 K1: createVehicleModel menjalankan cek-tulis di dalam tx terkunci dan menerima FK yatim", async () => {
    // G01: cek-tulis harus lewat delegate tx + kunci baris merek induk.
    const res = await actions.createVehicleModel(fdMap({ name: "Avanza", vehicleBrandId: 1 }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.$transaction).toHaveBeenCalled()
    const lockCall = (mocks.prismaMock.$queryRaw.mock.calls as unknown[][]).find((c) => {
      const a = c[0] as { sql?: string; strings?: string[] } | string[]
      const sql = Array.isArray(a) ? a.join("?") : (a.sql ?? a.strings?.join("?") ?? "")
      return /FROM vehicle_brands[\s\S]*FOR UPDATE/.test(sql)
    })
    expect(lockCall).toBeDefined()
    const createArg = mocks.prismaMock.vehicleModel.create.mock.calls.at(-1)?.[0] as any
    expect(createArg.data.slug).toBeTruthy()

    // G02: merek yatim dari delegasi tx -> ditolak menyebut merek, bukan
    // slug yatim atau error mentah (test terpisah karena clearAllMocks
    // tidak membuang Once antar-test ini; dipakai Once pada query kunci).
    ;(mocks.prismaMock.$queryRaw as any).mockResolvedValueOnce([])
    const missing = await actions.createVehicleModel(fdMap({ name: "Xenia", vehicleBrandId: 999 }))
    expect(missing?.success).toBe(false)
    expect(missing?.error).toContain("tidak ditemukan")
    expect(mocks.prismaMock.vehicleModel.create).toHaveBeenCalledTimes(1)
  })

  it("putaran 55 K1: createVehicleModel P2002 dari unique DB menjadi pesan duplikat", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.vehicleModel.create.mockRejectedValueOnce(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    )
    const res = await actions.createVehicleModel(fdMap({ name: "Avanza", vehicleBrandId: 1 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe('Model "Avanza" sudah ada untuk merek ini.')
  })

  it("putaran 55 K1: updateVehicleModel menolak nama sama (trim+case) yang lahir belakangan", async () => {
    mocks.prismaMock.vehicleModel.findMany.mockImplementation(async () => [{ id: 9, name: "Avanza" }])
    try {
      const res = await actions.updateVehicleModel(1, fdMap({ name: "  avanza ", vehicleBrandId: 1 }))
      expect(res?.success).toBe(false)
      expect(res?.error).toContain("sudah ada")
      expect(mocks.prismaMock.vehicleModel.update).not.toHaveBeenCalled()
    } finally {
      mocks.prismaMock.vehicleModel.findMany.mockResolvedValue([])
      expect(mocks.prismaMock.vehicleModel.create).not.toHaveBeenCalled()
    }
  })
  it("updateVehicleModel succeeds", async () => {
    const res = await actions.updateVehicleModel(1, fdMap({ name: "Avanza", vehicleBrandId: 1 }))
    expect(res?.success).toBe(true)
  })
  it("deleteVehicleModel succeeds", async () => {
    const res = await actions.deleteVehicleModel(1)
    expect(res?.success).toBe(true)
  })
})

describe("Vehicle Variant Actions", () => {
  it("createVehicleVariant succeeds", async () => {
    mocks.prismaMock.vehicleVariant.findFirst.mockResolvedValueOnce(null)
    const res = await actions.createVehicleVariant(fdMap({ name: "1.5 G", vehicleModelId: 1 }))
    expect(res?.success).toBe(true)
  })
  it("createVehicleVariant mengunci baris model sebelum cek duplikat (race regresi)", async () => {
    // Tanpa unique (vehicleModelId, name) di DB, cek findFirst lepas
    // membiarkan dua create konkuren membuat varian nama sama. Kunci baris
    // model induk di dalam tx menyerialkan cek-tulis per model.
    mocks.prismaMock.vehicleVariant.findFirst.mockResolvedValueOnce(null)
    const res = await actions.createVehicleVariant(fdMap({ name: "1.5 G", vehicleModelId: 1 }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.$transaction).toHaveBeenCalled()
    expect(mocks.prismaMock.$queryRaw).toHaveBeenCalled()
    const arg = mocks.prismaMock.$queryRaw.mock.calls[0][0] as unknown
    const sql = Array.isArray(arg)
      ? arg.join("?")
      : ((arg as { sql?: string; strings?: string[] }).sql ??
        (arg as { strings?: string[] }).strings?.join("?") ??
        "")
    expect(sql).toMatch(/FROM vehicle_models[\s\S]*FOR UPDATE/)
    expect(mocks.prismaMock.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.prismaMock.vehicleVariant.findFirst.mock.invocationCallOrder[0],
    )
  })
  it("createVehicleVariant menolak duplikat yang terlihat di bawah kunci tanpa create", async () => {
    mocks.prismaMock.vehicleVariant.findFirst.mockResolvedValueOnce({ id: 9 })
    const res = await actions.createVehicleVariant(fdMap({ name: "1.5 G", vehicleModelId: 1 }))
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.vehicleVariant.create).not.toHaveBeenCalled()
  })
  it("deleteVehicleVariant succeeds", async () => {
    const res = await actions.deleteVehicleVariant(1)
    expect(res?.success).toBe(true)
  })
})

describe("Vehicle Actions", () => {
  it("createVehicle succeeds", async () => {
    const res = await actions.createVehicle(fdMap({ variantId: 1, name: "Fortuner 2.4", year: 2023 }))
    expect(res?.success).toBe(true)
  })
  it("updateVehicle succeeds", async () => {
    const res = await actions.updateVehicle(1, fdMap({ variantId: 1, name: "Fortuner 2.4", year: 2023 }))
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
  it("updateCustomerVehicle memindahkan kepemilikan ke customerId baru yang valid", async () => {
    mocks.prismaMock.customerVehicle.findUniqueOrThrow.mockResolvedValue({ id: 1, customerId: 1, vehicleId: 1 })
    const res = await actions.updateCustomerVehicle(1, fdMap({ customerId: 2, variantId: 1, vehicleId: 1 }))
    expect(res?.success).toBe(true)
    const updateArg = mocks.prismaMock.customerVehicle.update.mock.calls.at(-1)![0] as any
    expect(updateArg.data.customerId).toBe(2)
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
      vehicleId: 9,
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
  // Bug: deleting only the CustomerVehicle linkage left its dedicated Vehicle row
  // orphaned (no customer, invisible everywhere), because createCustomerVehicle
  // always creates a 1:1 Vehicle for a variant-driven vehicle. The delete must
  // remove the Vehicle too when this is its last owner, atomically.
  it("deleteCustomerVehicle also deletes the backing Vehicle when it is the last owner", async () => {
    mocks.prismaMock.customerVehicle.findUniqueOrThrow.mockResolvedValue({
      id: 1, customerId: 1, vehicleId: 9, _count: { workOrders: 0, quotations: 0, projects: 0 }
    })
    mocks.prismaMock.customerVehicle.count.mockResolvedValueOnce(0) // no other owners
    const res = await actions.deleteCustomerVehicle(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.customerVehicle.delete).toHaveBeenCalledWith({ where: { id: 1 } })
    expect(mocks.prismaMock.vehicle.deleteMany).toHaveBeenCalledWith({ where: { id: 9 } })
  })
  it("deleteCustomerVehicle keeps a shared Vehicle when another CustomerVehicle still owns it", async () => {
    mocks.prismaMock.customerVehicle.findUniqueOrThrow.mockResolvedValue({
      id: 1, customerId: 1, vehicleId: 9, _count: { workOrders: 0, quotations: 0, projects: 0 }
    })
    mocks.prismaMock.customerVehicle.count.mockResolvedValueOnce(2) // shared
    const res = await actions.deleteCustomerVehicle(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.customerVehicle.delete).toHaveBeenCalledWith({ where: { id: 1 } })
    expect(mocks.prismaMock.vehicle.deleteMany).not.toHaveBeenCalled()
  })
  // Bug: customerId/variantId/vehicleId hanya dicek format (int positif).
  // Customer terhapus/inaktif, varian fiktif, tipe fiktif lolos schema lalu
  // gagal P2003 mentah — atau menempel ke pelanggan mati. Cek eksistensi
  // pra-tulis wajib (pola withholding-tax/position-department).
  it("createCustomerVehicle menolak customer fiktif/terhapus", async () => {
    mocks.prismaMock.customer.findFirst.mockResolvedValueOnce(null)
    const res = await actions.createCustomerVehicle(fdMap({ customerId: 999, variantId: 1 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Pelanggan tidak ditemukan")
    expect(mocks.prismaMock.customerVehicle.create).not.toHaveBeenCalled()
    expect(mocks.prismaMock.vehicle.create).not.toHaveBeenCalled()
  })
  it("createCustomerVehicle menolak variantId fiktif", async () => {
    mocks.prismaMock.customer.findFirst.mockResolvedValueOnce({ id: 1 })
    mocks.prismaMock.vehicleVariant.findFirst.mockResolvedValueOnce(null)
    const res = await actions.createCustomerVehicle(fdMap({ customerId: 1, variantId: 999 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Varian kendaraan tidak ditemukan")
    expect(mocks.prismaMock.customerVehicle.create).not.toHaveBeenCalled()
    expect(mocks.prismaMock.vehicle.create).not.toHaveBeenCalled()
  })
  it("createCustomerVehicle menolak vehicleId fiktif", async () => {
    mocks.prismaMock.customer.findFirst.mockResolvedValueOnce({ id: 1 })
    mocks.prismaMock.vehicle.findFirst.mockResolvedValueOnce(null)
    const res = await actions.createCustomerVehicle(fdMap({ customerId: 1, vehicleId: 999 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Tipe kendaraan tidak ditemukan")
    expect(mocks.prismaMock.customerVehicle.create).not.toHaveBeenCalled()
  })
  it("updateCustomerVehicle menolak customer fiktif/terhapus", async () => {
    mocks.prismaMock.customerVehicle.findUniqueOrThrow.mockResolvedValue({ id: 1, customerId: 1, vehicleId: 1 })
    mocks.prismaMock.customer.findFirst.mockResolvedValueOnce(null)
    const res = await actions.updateCustomerVehicle(1, fdMap({ customerId: 999, variantId: 1 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Pelanggan tidak ditemukan")
    expect(mocks.prismaMock.customerVehicle.update).not.toHaveBeenCalled()
    expect(mocks.prismaMock.vehicle.update).not.toHaveBeenCalled()
  })
  it("updateCustomerVehicle menolak variantId fiktif tanpa mutasi Vehicle bersama", async () => {
    mocks.prismaMock.customerVehicle.findUniqueOrThrow.mockResolvedValue({ id: 1, customerId: 1, vehicleId: 1 })
    mocks.prismaMock.customer.findFirst.mockResolvedValueOnce({ id: 1 })
    mocks.prismaMock.vehicleVariant.findFirst.mockResolvedValueOnce(null)
    const res = await actions.updateCustomerVehicle(1, fdMap({ customerId: 1, variantId: 999 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Varian kendaraan tidak ditemukan")
    expect(mocks.prismaMock.customerVehicle.update).not.toHaveBeenCalled()
    expect(mocks.prismaMock.vehicle.update).not.toHaveBeenCalled()
  })
  // Round4 #6: Vehicle katalog dipakai bersama beberapa CustomerVehicle —
  // edit satu link tidak boleh memutasi varian/tahun pemilik lain.
  it("updateCustomerVehicle bersama (variant): buat baris katalog berbeda, tanpa mutasi bersama", async () => {
    mocks.prismaMock.customerVehicle.findUniqueOrThrow.mockResolvedValue({ id: 1, customerId: 1, vehicleId: 9 })
    mocks.prismaMock.customerVehicle.count.mockResolvedValue(1) // pemilik lain
    mocks.prismaMock.vehicle.findUnique.mockResolvedValue({ id: 9, vehicleVariantId: 1, year: 2020 })
    mocks.prismaMock.vehicle.findFirst.mockResolvedValue(null) // belum ada baris cocok
    mocks.prismaMock.vehicle.create.mockResolvedValue({ id: 42 })
    const res = await actions.updateCustomerVehicle(1, fdMap({ customerId: 1, variantId: 2, year: 2024 }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.vehicle.update).not.toHaveBeenCalled()
    expect(mocks.prismaMock.vehicle.create).toHaveBeenCalledWith({
      data: { vehicleVariantId: 2, year: 2024 },
    })
    const link = mocks.prismaMock.customerVehicle.update.mock.calls[0][0]
    expect(link.data.vehicleId).toBe(42)
  })
  it("updateCustomerVehicle bersama (variant): pakai baris katalog cocok yang sudah ada", async () => {
    mocks.prismaMock.customerVehicle.findUniqueOrThrow.mockResolvedValue({ id: 1, customerId: 1, vehicleId: 9 })
    mocks.prismaMock.customerVehicle.count.mockResolvedValue(2)
    mocks.prismaMock.vehicle.findUnique.mockResolvedValue({ id: 9, vehicleVariantId: 1, year: 2020 })
    mocks.prismaMock.vehicle.findFirst.mockResolvedValue({ id: 33 })
    const res = await actions.updateCustomerVehicle(1, fdMap({ customerId: 1, variantId: 2, year: 2024 }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.vehicle.update).not.toHaveBeenCalled()
    expect(mocks.prismaMock.vehicle.create).not.toHaveBeenCalled()
    expect(mocks.prismaMock.customerVehicle.update.mock.calls[0][0].data.vehicleId).toBe(33)
  })
  it("updateCustomerVehicle eksklusif (variant): mutasi in-place baris katalog sendiri", async () => {
    mocks.prismaMock.customerVehicle.findUniqueOrThrow.mockResolvedValue({ id: 1, customerId: 1, vehicleId: 9 })
    mocks.prismaMock.customerVehicle.count.mockResolvedValue(0)
    mocks.prismaMock.vehicle.findUnique.mockResolvedValue({ id: 9, vehicleVariantId: 1, year: 2020 })
    mocks.prismaMock.vehicle.update.mockResolvedValue({ id: 9 })
    const res = await actions.updateCustomerVehicle(1, fdMap({ customerId: 1, variantId: 2, year: 2024 }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.vehicle.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { vehicleVariantId: 2, year: 2024 },
    })
    expect(mocks.prismaMock.vehicle.create).not.toHaveBeenCalled()
    expect(mocks.prismaMock.customerVehicle.update.mock.calls[0][0].data.vehicleId).toBe(9)
  })
  it("updateCustomerVehicle bersama (vehicleId): relink year berubah ke baris berbeda, bersama utuh", async () => {
    mocks.prismaMock.customerVehicle.findUniqueOrThrow.mockResolvedValue({ id: 1, customerId: 1, vehicleId: 9 })
    mocks.prismaMock.vehicle.findUnique.mockResolvedValue({ id: 5, vehicleVariantId: 7, year: 2020 })
    mocks.prismaMock.customerVehicle.count.mockResolvedValue(1) // target dipakai link lain
    mocks.prismaMock.vehicle.findFirst.mockResolvedValue({ id: 44 })
    const res = await actions.updateCustomerVehicle(1, fdMap({ customerId: 1, vehicleId: 5, year: 2024 }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.vehicle.update).not.toHaveBeenCalled()
    expect(mocks.prismaMock.vehicle.create).not.toHaveBeenCalled()
    expect(mocks.prismaMock.customerVehicle.update.mock.calls[0][0].data.vehicleId).toBe(44)
  })
  it("updateCustomerVehicle menolak vehicleId fiktif", async () => {
    mocks.prismaMock.customerVehicle.findUniqueOrThrow.mockResolvedValue({ id: 1, customerId: 1, vehicleId: 1 })
    mocks.prismaMock.customer.findFirst.mockResolvedValueOnce({ id: 1 })
    mocks.prismaMock.vehicle.findFirst.mockResolvedValueOnce(null)
    const res = await actions.updateCustomerVehicle(1, fdMap({ customerId: 1, vehicleId: 999 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Tipe kendaraan tidak ditemukan")
    expect(mocks.prismaMock.customerVehicle.update).not.toHaveBeenCalled()
    expect(mocks.prismaMock.vehicle.update).not.toHaveBeenCalled()
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
    const res = await actions.createVehicleModel(fdMap({ name: "Avanza", vehicleBrandId: 1 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("updateVehicleModel fails if duplicate name", async () => {
    mocks.prismaMock.vehicleModel.findMany.mockImplementation(async () => [{ id: 2, name: "Avanza" }])
    try {
      const res = await actions.updateVehicleModel(1, fdMap({ name: "Avanza", vehicleBrandId: 1 }))
      expect(res?.success).toBe(false)
      expect(res?.error).toContain("sudah ada")
    } finally {
      mocks.prismaMock.vehicleModel.findMany.mockResolvedValue([])
    }
  })
  it("deleteVehicle refuses if has relation dependents (line 345 branch)", async () => {
    mocks.prismaMock.vehicleVariant.findFirst.mockResolvedValueOnce({ id: 2 })
    const res = await actions.createVehicleVariant(fdMap({ name: "1.5 G", vehicleModelId: 1 }))
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
    const res = await actions.updateVehicleModel(1, fdMap({ name: "Avanza", vehicleBrandId: 1 }))
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
    mocks.prismaMock.vehicleVariant.findFirst.mockResolvedValueOnce(null)
    mocks.prismaMock.vehicleVariant.create.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.createVehicleVariant(fdMap({ name: "1.5 G", vehicleModelId: 1 }))
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
    const res = await actions.createVehicle(fdMap({ name: "no variant" }))
    expect(res?.success).toBe(false)
  })
  it("createVehicle handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.vehicle.create.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.createVehicle(fdMap({ variantId: 1 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
  it("updateVehicle fails validation", async () => {
    const res = await actions.updateVehicle(1, fdMap({ name: "no variant" }))
    expect(res?.success).toBe(false)
  })
  it("updateVehicle handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.vehicle.update.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.updateVehicle(1, fdMap({ variantId: 1 }))
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
    mocks.prismaMock.vehicleModel.findMany.mockImplementation(async () => [{ id: 2, name: "Avanza" }])
    try {
      const res = await actions.createVehicleModel(fdMap({ name: "Avanza", vehicleBrandId: 1 }))
      expect(res?.success).toBe(false)
      expect(res?.error).toContain("sudah ada")
    } finally {
      mocks.prismaMock.vehicleModel.findMany.mockResolvedValue([])
    }
  })
  it("createVehicle stores name and year on the catalog type", async () => {
    const res = await actions.createVehicle(fdMap({ variantId: 42, name: "Avanza 1.3 G", year: 2022 }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.vehicle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ vehicleVariantId: 42, name: "Avanza 1.3 G", year: 2022 }),
      })
    )
  })
  it("deleteVehicleVariant revalidates when variant exists (line 217 branch)", async () => {
    mocks.prismaMock.vehicleVariant.findUnique.mockResolvedValueOnce({ id: 1, vehicleModelId: 3 })
    const res = await actions.deleteVehicleVariant(1)
    expect(res?.success).toBe(true)
  })
  it("deleteVehicleVariant refuses when only fitment rules reference the variant", async () => {
    mocks.prismaMock.vehicle.count.mockResolvedValueOnce(0)
    mocks.prismaMock.vehicleFitmentRule.count.mockResolvedValueOnce(2)
    const res = await actions.deleteVehicleVariant(1)
    expect(res?.success).toBe(false)
    expect(String(res?.error)).toMatch(/aturan kompatibilitas: 2/)
    expect(mocks.prismaMock.vehicleVariant.delete).not.toHaveBeenCalled()
  })
})

describe("Next.js redirect error handling", () => {
  const redirectErr = new Error("redirect")
  ;(redirectErr as unknown as { digest: string }).digest = "NEXT_REDIRECT_TEST"

  const fnsToTest = [
    { name: "createVehicleBrand", fn: () => actions.createVehicleBrand(fdMap({ name: "Toyota" })) },
    { name: "createVehicleModel", fn: () => actions.createVehicleModel(fdMap({ name: "Avanza", vehicleBrandId: 1 })) },
    { name: "createVehicle", fn: () => actions.createVehicle(fdMap({ variantId: 1 })) },
    { name: "deleteVehicleBrand", fn: () => actions.deleteVehicleBrand(1) },
    { name: "deleteVehicleModel", fn: () => actions.deleteVehicleModel(1) },
    { name: "createVehicleVariant", fn: () => actions.createVehicleVariant(fdMap({ name: "1.5 G", vehicleModelId: 1 })) },
    { name: "deleteVehicleVariant", fn: () => actions.deleteVehicleVariant(1) },
    { name: "updateVehicleBrand", fn: () => actions.updateVehicleBrand(1, fdMap({ name: "Toyota" })) },
    { name: "updateVehicleModel", fn: () => actions.updateVehicleModel(1, fdMap({ name: "Avanza", vehicleBrandId: 1 })) },
    { name: "updateVehicle", fn: () => actions.updateVehicle(1, fdMap({ variantId: 1 })) },
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

describe("updateCustomerVehicleServiceSchedule guard km (021-S)", () => {
  const existing = { id: 5, customerId: 9, lastOdometerKm: 50000 }

  it("km sama dengan odometer terakhir ditolak, update 0x", async () => {
    mocks.prismaMock.customerVehicle.findFirst.mockResolvedValue(existing)
    const res = await actions.updateCustomerVehicleServiceSchedule(
      5,
      fdMap({ nextServiceKm: 50000 }),
    )
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("harus lebih besar")
    expect(mocks.prismaMock.customerVehicle.update).not.toHaveBeenCalled()
  })

  it("km di bawah odometer terakhir ditolak, update 0x", async () => {
    mocks.prismaMock.customerVehicle.findFirst.mockResolvedValue(existing)
    const res = await actions.updateCustomerVehicleServiceSchedule(
      5,
      fdMap({ nextServiceKm: 49999 }),
    )
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("harus lebih besar")
    expect(mocks.prismaMock.customerVehicle.update).not.toHaveBeenCalled()
  })

  it("tanpa izin ditolak sebelum query apa pun", async () => {
    mocks.requirePermissionMock.mockRejectedValueOnce(
      new Error("Anda tidak memiliki izin edit_customers"),
    )
    const res = await actions.updateCustomerVehicleServiceSchedule(
      5,
      fdMap({ nextServiceKm: 60000 }),
    )
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.customerVehicle.findFirst).not.toHaveBeenCalled()
    expect(mocks.prismaMock.customerVehicle.update).not.toHaveBeenCalled()
  })

  it("km sah di atas odometer update tepat 1x", async () => {
    mocks.prismaMock.customerVehicle.findFirst.mockResolvedValue(existing)
    const res = await actions.updateCustomerVehicleServiceSchedule(
      5,
      fdMap({ nextServiceKm: 60000 }),
    )
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.customerVehicle.updateMany).toHaveBeenCalledTimes(1)
  })

  it("odometer belum tercatat -> km berapa pun diterima (guard hanya bila ada acuan)", async () => {
    mocks.prismaMock.customerVehicle.findFirst.mockResolvedValue({
      ...existing,
      lastOdometerKm: null,
    })
    const res = await actions.updateCustomerVehicleServiceSchedule(
      5,
      fdMap({ nextServiceKm: 1000 }),
    )
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.customerVehicle.updateMany).toHaveBeenCalledTimes(1)
  })

  it("regresi putaran 50: odometer naik sesudah dibaca -> klaim kondisional menolak jadwal basi", async () => {
    mocks.prismaMock.customerVehicle.findFirst
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({ ...existing, lastOdometerKm: 65000 })
    mocks.prismaMock.customerVehicle.updateMany.mockResolvedValue({ count: 0 })
    const res = await actions.updateCustomerVehicleServiceSchedule(
      5,
      fdMap({ nextServiceKm: 60000 }),
    )
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("65.000")
    expect(mocks.prismaMock.customerVehicle.update).not.toHaveBeenCalled()
    mocks.prismaMock.customerVehicle.updateMany.mockResolvedValue({ count: 1 })
  })
})

describe("updateCustomerVehicleServiceSchedule perilaku aksi (021-S)", () => {
  const existing = { id: 5, customerId: 9, lastOdometerKm: 50000 }

  it("memakai kunci izin persis edit_customers", async () => {
    mocks.prismaMock.customerVehicle.findFirst.mockResolvedValue(existing)
    const res = await actions.updateCustomerVehicleServiceSchedule(
      5,
      fdMap({ nextServiceKm: 60000 }),
    )
    expect(res?.success).toBe(true)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_customers")
  })

  it("tanggal lampau sah tersimpan apa adanya (langsung terlewat, tidak ditolak)", async () => {
    mocks.prismaMock.customerVehicle.findFirst.mockResolvedValue(existing)
    const res = await actions.updateCustomerVehicleServiceSchedule(
      5,
      fdMap({ nextServiceDate: "2020-01-15" }),
    )
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.customerVehicle.updateMany.mock.calls[0][0]
    expect(arg.data.nextServiceDate).toBeInstanceOf(Date)
    expect(arg.data.nextServiceDate.toISOString().slice(0, 10)).toBe("2020-01-15")
  })

  it("keduanya kosong = kosongkan jadwal (date/km/note null, updatedBy/At terisi)", async () => {
    mocks.prismaMock.customerVehicle.findFirst.mockResolvedValue(existing)
    const res = await actions.updateCustomerVehicleServiceSchedule(5, fdMap({}))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.customerVehicle.updateMany.mock.calls[0][0]
    expect(arg.data.nextServiceDate).toBeNull()
    expect(arg.data.nextServiceKm).toBeNull()
    expect(arg.data.nextServiceNote).toBeNull()
    expect(arg.data.nextServiceUpdatedBy).toBe(1)
    expect(arg.data.nextServiceUpdatedAt).toBeInstanceOf(Date)
  })

  it("izin ditolak -> gagal sebelum parse/tulis, update 0x", async () => {
    mocks.requirePermissionMock.mockRejectedValueOnce(new Error("tanpa izin"))
    const res = await actions.updateCustomerVehicleServiceSchedule(
      5,
      fdMap({ nextServiceKm: 60000 }),
    )
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.customerVehicle.findFirst).not.toHaveBeenCalled()
    expect(mocks.prismaMock.customerVehicle.update).not.toHaveBeenCalled()
  })
})
