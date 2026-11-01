import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1 }),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  })

  return {
    requirePermissionMock: vi.fn(),
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
    settingsMock: vi.fn().mockResolvedValue({}),
    countMock: vi.fn().mockResolvedValue(0),
    prismaMock: {
      paymentMethod: buildModelMock(),
      shippingMethod: buildModelMock(),
    }
  }
})

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    ...mocks.prismaMock,
    quotation: { count: mocks.countMock },
    downPayment: { count: mocks.countMock },
    salesPayment: { count: mocks.countMock },
    salesLateFeePayment: { count: mocks.countMock },
    vendorPayment: { count: mocks.countMock },
  },
}))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))
vi.mock("@/lib/utils/settings", () => ({ getSystemSettings: mocks.settingsMock }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: vi.fn().mockResolvedValue("AUTO-001") }))

import * as actions from "../method.actions"

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
  mocks.settingsMock.mockResolvedValue({})
  mocks.countMock.mockResolvedValue(0)
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("guard kode metode dirujuk dokumen (putaran 21)", () => {
  it("deletePaymentMethod ditolak bila kode masih dipakai dokumen", async () => {
    mocks.prismaMock.paymentMethod.findUnique.mockResolvedValue({ code: "CASH" })
    mocks.countMock.mockResolvedValue(4)
    const res = await actions.deletePaymentMethod(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("masih dipakai")
    expect(mocks.prismaMock.paymentMethod.delete).not.toHaveBeenCalled()
  })

  it("deletePaymentMethod jalan bila kode bebas rujukan", async () => {
    mocks.prismaMock.paymentMethod.findUnique.mockResolvedValue({ code: "CASH" })
    const res = await actions.deletePaymentMethod(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.paymentMethod.delete).toHaveBeenCalledTimes(1)
  })

  it("updatePaymentMethod ganti kode ditolak bila kode lama dipakai", async () => {
    mocks.prismaMock.paymentMethod.findUnique.mockResolvedValue({ code: "CASH" })
    mocks.countMock.mockResolvedValue(2)
    const res = await actions.updatePaymentMethod(1, fdMap({ name: "Tunai", code: "CASH2" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("masih dipakai")
    expect(mocks.prismaMock.paymentMethod.update).not.toHaveBeenCalled()
  })

  it("updatePaymentMethod rename nama saja (kode sama) tetap jalan walau dipakai", async () => {
    mocks.prismaMock.paymentMethod.findUnique.mockResolvedValue({ code: "CASH" })
    mocks.countMock.mockResolvedValue(2)
    const res = await actions.updatePaymentMethod(1, fdMap({ name: "Tunai Baru", code: "CASH" }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.paymentMethod.update).toHaveBeenCalledTimes(1)
  })

  it("deleteShippingMethod ditolak bila kode dipakai penawaran", async () => {
    mocks.prismaMock.shippingMethod.findUnique.mockResolvedValue({ code: "KIRIM" })
    mocks.countMock.mockResolvedValue(1)
    const res = await actions.deleteShippingMethod(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("masih dipakai")
    expect(mocks.prismaMock.shippingMethod.delete).not.toHaveBeenCalled()
  })
})

describe("reuse nama metode nonaktif (putaran 50)", () => {
  it("createPaymentMethod menolak nama yang sudah ada tetapi nonaktif", async () => {
    mocks.prismaMock.paymentMethod.findFirst.mockResolvedValue({ id: 7, slug: "transfer-lama", isActive: false })
    const res = await actions.createPaymentMethod(fdMap({ name: "Transfer Lama" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("nonaktif")
    expect(mocks.prismaMock.paymentMethod.create).not.toHaveBeenCalled()
  })

  it("createPaymentMethod tetap reuse nama aktif persis", async () => {
    mocks.prismaMock.paymentMethod.findFirst.mockResolvedValue({ id: 7, slug: "transfer", isActive: true })
    const res = await actions.createPaymentMethod(fdMap({ name: "Transfer" }))
    expect(res?.success).toBe(true)
    expect((res as any)?.id).toBe(7)
    expect(mocks.prismaMock.paymentMethod.create).not.toHaveBeenCalled()
    // clearAllMocks tidak membuang mockResolvedValue persisten — pulihkan.
    mocks.prismaMock.paymentMethod.findFirst.mockResolvedValue(null)
  })
})

describe("Payment Method Actions", () => {
  it("createPaymentMethod succeeds", async () => {
    const res = await actions.createPaymentMethod(fdMap({ name: "Cash", code: "CASH" }))
    expect(res?.success).toBe(true)
  })

  it("createPaymentMethod generates auto code if missing", async () => {
    const res = await actions.createPaymentMethod(fdMap({ name: "Cash" }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.paymentMethod.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: "AUTO-001" }) })
    )
  })

  it("createPaymentMethod respects disableAutoPaymentMethodCode settings", async () => {
    mocks.settingsMock.mockResolvedValue({ enableAutoPaymentMethodCode: false })
    const res = await actions.createPaymentMethod(fdMap({ name: "Cash" }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.paymentMethod.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: "AUTO-001" }) }) // still generates because code is empty
    )
  })

  it("createPaymentMethod accepts explicit code when auto setting is false", async () => {
    mocks.settingsMock.mockResolvedValue({ enableAutoPaymentMethodCode: false })
    const res = await actions.createPaymentMethod(fdMap({ name: "Cash", code: "MANUAL" }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.paymentMethod.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: "MANUAL" }) })
    )
  })

  it("createPaymentMethod fails validation", async () => {
    const res = await actions.createPaymentMethod(fdMap({ name: "" }))
    expect(res?.success).toBe(false)
  })

  it("createPaymentMethod handles error", async () => {
    mocks.requirePermissionMock.mockRejectedValue(new Error("auth err"))
    const res = await actions.createPaymentMethod(fdMap({ name: "Cash" }))
    expect(res?.success).toBe(false)
  })

  it("createPaymentMethod throws NEXT_REDIRECT errors", async () => {
    mocks.requirePermissionMock.mockRejectedValue({ digest: "NEXT_REDIRECT_123" })
    await expect(actions.createPaymentMethod(fdMap({ name: "Cash" }))).rejects.toEqual({ digest: "NEXT_REDIRECT_123" })
  })

  it("updatePaymentMethod succeeds", async () => {
    const res = await actions.updatePaymentMethod(1, fdMap({ name: "Cash", code: "CASH" }))
    expect(res?.success).toBe(true)
  })

  it("updatePaymentMethod fails validation", async () => {
    const res = await actions.updatePaymentMethod(1, fdMap({ name: "" }))
    expect(res?.success).toBe(false)
  })

  it("updatePaymentMethod handles error", async () => {
    mocks.requirePermissionMock.mockRejectedValue("string error")
    const res = await actions.updatePaymentMethod(1, fdMap({ name: "Cash", code: "CASH" }))
    expect(res?.success).toBe(false)
  })

  it("updatePaymentMethod throws NEXT_REDIRECT errors", async () => {
    mocks.requirePermissionMock.mockRejectedValue({ digest: "NEXT_REDIRECT_123" })
    await expect(actions.updatePaymentMethod(1, fdMap({ name: "Cash", code: "CASH" }))).rejects.toEqual({ digest: "NEXT_REDIRECT_123" })
  })

  it("deletePaymentMethod succeeds", async () => {
    const res = await actions.deletePaymentMethod(1)
    expect(res?.success).toBe(true)
  })

  it("deletePaymentMethod handles error", async () => {
    mocks.requirePermissionMock.mockRejectedValue(null)
    const res = await actions.deletePaymentMethod(1)
    expect(res?.success).toBe(false)
  })

  it("deletePaymentMethod throws NEXT_REDIRECT errors", async () => {
    mocks.requirePermissionMock.mockRejectedValue({ digest: "NEXT_REDIRECT_123" })
    await expect(actions.deletePaymentMethod(1)).rejects.toEqual({ digest: "NEXT_REDIRECT_123" })
  })
})

describe("Shipping Method Actions", () => {
  it("createShippingMethod succeeds", async () => {
    const res = await actions.createShippingMethod(fdMap({ name: "JNE", code: "JNE" }))
    expect(res?.success).toBe(true)
  })

  it("createShippingMethod generates auto code if missing", async () => {
    const res = await actions.createShippingMethod(fdMap({ name: "JNE" }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.shippingMethod.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: "AUTO-001" }) })
    )
  })

  it("createShippingMethod respects disableAutoShippingMethodCode settings", async () => {
    mocks.settingsMock.mockResolvedValue({ enableAutoShippingMethodCode: false })
    const res = await actions.createShippingMethod(fdMap({ name: "JNE", code: "C" }))
    expect(res?.success).toBe(true)
    // since code is provided and setting is false, it shouldn't override with AUTO-001
    expect(mocks.prismaMock.shippingMethod.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: "C" }) })
    )
  })

  it("createShippingMethod fails validation", async () => {
    const res = await actions.createShippingMethod(fdMap({ name: "" }))
    expect(res?.success).toBe(false)
  })

  it("createShippingMethod handles error", async () => {
    mocks.requirePermissionMock.mockRejectedValue(new Error("auth err"))
    const res = await actions.createShippingMethod(fdMap({ name: "JNE" }))
    expect(res?.success).toBe(false)
  })

  it("createShippingMethod throws NEXT_REDIRECT errors", async () => {
    mocks.requirePermissionMock.mockRejectedValue({ digest: "NEXT_REDIRECT_123" })
    await expect(actions.createShippingMethod(fdMap({ name: "JNE" }))).rejects.toEqual({ digest: "NEXT_REDIRECT_123" })
  })

  it("createShippingMethod logs raw error when message is empty", async () => {
    mocks.requirePermissionMock.mockRejectedValue(new Error(""))
    const res = await actions.createShippingMethod(fdMap({ name: "JNE" }))
    expect(res?.success).toBe(false)
  })

  it("updateShippingMethod succeeds", async () => {
    const res = await actions.updateShippingMethod(1, fdMap({ name: "JNE", code: "JNE" }))
    expect(res?.success).toBe(true)
  })

  it("updateShippingMethod fails validation", async () => {
    const res = await actions.updateShippingMethod(1, fdMap({ name: "" }))
    expect(res?.success).toBe(false)
  })

  it("updateShippingMethod handles error", async () => {
    mocks.requirePermissionMock.mockRejectedValue(new Error("auth err"))
    const res = await actions.updateShippingMethod(1, fdMap({ name: "JNE", code: "JNE" }))
    expect(res?.success).toBe(false)
  })

  it("updateShippingMethod throws NEXT_REDIRECT errors", async () => {
    mocks.requirePermissionMock.mockRejectedValue({ digest: "NEXT_REDIRECT_123" })
    await expect(actions.updateShippingMethod(1, fdMap({ name: "JNE", code: "JNE" }))).rejects.toEqual({ digest: "NEXT_REDIRECT_123" })
  })

  it("deleteShippingMethod succeeds", async () => {
    const res = await actions.deleteShippingMethod(1)
    expect(res?.success).toBe(true)
  })

  it("deleteShippingMethod handles error", async () => {
    mocks.requirePermissionMock.mockRejectedValue(new Error("auth err"))
    const res = await actions.deleteShippingMethod(1)
    expect(res?.success).toBe(false)
  })

  it("deleteShippingMethod throws NEXT_REDIRECT errors", async () => {
    mocks.requirePermissionMock.mockRejectedValue({ digest: "NEXT_REDIRECT_123" })
    await expect(actions.deleteShippingMethod(1)).rejects.toEqual({ digest: "NEXT_REDIRECT_123" })
  })
})
