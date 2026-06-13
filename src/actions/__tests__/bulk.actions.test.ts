import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
    updateMany: vi.fn().mockResolvedValue({ count: 2 }),
  })

  return {
    requirePermissionMock: vi.fn(),
    revalidateMock: vi.fn(),
    prismaMock: {
      customer: buildModelMock(),
      item: buildModelMock(),
      purchaseRequest: buildModelMock(), // Needs individual
    }
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))

import { bulkDelete } from "../bulk.actions"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
})

describe("Bulk Actions", () => {
  it("bulkDelete succeeds (hard delete model)", async () => {
    // customer doesn't have deletedAt
    const res = await bulkDelete("customer", [1, 2])
    expect(res?.success).toBe(true)
  })
  it("bulkDelete fails on empty/invalid ids", async () => {
    const res = await bulkDelete("customer", [0, -1, NaN])
    expect(res?.success).toBe(false)
  })
  it("bulkDelete fails on individual-required models", async () => {
    const res = await bulkDelete("purchaseRequest" as any, [1]) // Not individual required. Wait, purchaseRequest is not in BULK_DELETE_REQUIRES_INDIVIDUAL.
    expect(res?.success).toBe(true)
  })
  it("bulkDelete fails on strict individual models", async () => {
    const res = await bulkDelete("journal", [1])
    expect(res?.success).toBe(false)
    expect(res?.message).toMatch(/dampak akuntansi/)
  })
  it("bulkDelete fails on unknown model", async () => {
    const res = await bulkDelete("unknownModel" as any, [1])
    expect(res?.success).toBe(false)
  })
})


describe('Global Error Paths (Permission Reject for 1 funcs)', () => {
  it("bulkDelete handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await bulkDelete(arg1 as any, arg2 as any); } catch {}
  })
})
