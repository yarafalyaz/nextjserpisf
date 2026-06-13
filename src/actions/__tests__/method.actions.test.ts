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
    prismaMock: {
      paymentMethod: buildModelMock(),
      shippingMethod: buildModelMock(),
    }
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))
vi.mock("@/lib/utils/settings", () => ({ getSystemSettings: vi.fn().mockResolvedValue({}) }))
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
})

describe("Payment Method Actions", () => {
  it("createPaymentMethod succeeds", async () => {
    const res = await actions.createPaymentMethod(fdMap({ name: "Cash", code: "CASH" }))
    expect(res?.success).toBe(true)
  })
  it("updatePaymentMethod succeeds", async () => {
    const res = await actions.updatePaymentMethod(1, fdMap({ name: "Cash", code: "CASH" }))
    expect(res?.success).toBe(true)
  })
  it("deletePaymentMethod succeeds", async () => {
    const res = await actions.deletePaymentMethod(1)
    expect(res?.success).toBe(true)
  })
})

describe("Shipping Method Actions", () => {
  it("createShippingMethod succeeds", async () => {
    const res = await actions.createShippingMethod(fdMap({ name: "JNE", code: "JNE" }))
    expect(res?.success).toBe(true)
  })
  it("updateShippingMethod succeeds", async () => {
    const res = await actions.updateShippingMethod(1, fdMap({ name: "JNE", code: "JNE" }))
    expect(res?.success).toBe(true)
  })
  it("deleteShippingMethod succeeds", async () => {
    const res = await actions.deleteShippingMethod(1)
    expect(res?.success).toBe(true)
  })
})
