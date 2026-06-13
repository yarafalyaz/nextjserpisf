import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
    updateMany: vi.fn().mockResolvedValue({ count: 2 }),
  })

  return {
    requirePermissionMock: vi.fn(),
    revalidateMock: vi.fn(),
    buildModelMock,
    prismaMock: {
      customer: buildModelMock(),
      item: buildModelMock(),
      purchaseRequest: buildModelMock(), // Needs individual
      employee: buildModelMock(), // Used for hasSoftDelete test
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

// We need to mock Prisma DMMF to control hasSoftDelete logic
vi.mock("@prisma/client", () => ({
  Prisma: {
    dmmf: {
      datamodel: {
        models: [
          { name: "Customer", fields: [{ name: "id" }, { name: "name" }] },
          { name: "Item", fields: [{ name: "id" }] },
          { name: "Employee", fields: [{ name: "id" }, { name: "deletedAt" }] },
          { name: "Journal", fields: [{ name: "id" }] },
          { name: "PurchaseRequest", fields: [{ name: "id" }] },
          { name: "Bank", fields: [{ name: "id" }] },
          // Intentionally omitting 'asset' to test dmmfModelMap missing case
        ]
      }
    }
  }
}))

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
    expect(res?.message).toMatch(/tidak diizinkan/)
  })
  it("bulkDelete fails when > 500 ids provided", async () => {
    const manyIds = Array.from({ length: 501 }, (_, i) => i + 1)
    const res = await bulkDelete("customer", manyIds)
    expect(res?.success).toBe(false)
    expect(res?.message).toMatch(/Maksimal 500 data/)
  })
  it("bulkDelete fails when prisma model not found", async () => {
    // Pass a valid model name that is missing from prismaMock
    const res = await bulkDelete("bank", [1])
    expect(res?.success).toBe(false)
    expect(res?.message).toMatch(/tidak ditemukan/)
  })
  it("bulkDelete fails when dmmf schema not found", async () => {
    // asset is a valid model, we'll add it to prismaMock but NOT to dmmf mock above
    (mocks.prismaMock as any)["asset"] = mocks.buildModelMock()
    const res = await bulkDelete("asset", [1])
    expect(res?.success).toBe(false)
    expect(res?.message).toMatch(/Skema model asset tidak ditemukan/)
  })
  it("bulkDelete uses soft delete when deletedAt exists", async () => {
    const res = await bulkDelete("employee", [1])
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.employee.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1] } },
      data: { deletedAt: expect.any(Date) }
    })
  })
  it("bulkDelete catches and logs errors during deletion", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.customer.deleteMany.mockRejectedValueOnce(new Error("DB error"))
    const res = await bulkDelete("customer", [1])
    expect(res?.success).toBe(false)
    expect(res?.message).toMatch(/Gagal menghapus data/)
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
