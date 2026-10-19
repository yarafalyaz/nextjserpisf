import { describe, it, expect, vi, beforeEach } from "vitest"

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()
const nextSlugMock = vi.fn()

const expenseCategoryCreateMock = vi.fn()
const expenseCategoryUpdateMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    expenseCategory: {
      create: (...a: unknown[]) => expenseCategoryCreateMock(...a),
      update: (...a: unknown[]) => expenseCategoryUpdateMock(...a),
    },
  },
}))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))
vi.mock("@/lib/utils/slug-db", () => ({
  nextSlug: (...a: unknown[]) => nextSlugMock(...a),
}))

import { createExpenseCategory, updateExpenseCategory } from "../expense-category.actions"

function fd(payload: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) f.append(k, v)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  requirePermissionMock.mockResolvedValue({ id: 1 })
  nextSlugMock.mockResolvedValue("slug-x")
  expenseCategoryCreateMock.mockResolvedValue({ id: 1 })
  expenseCategoryUpdateMock.mockResolvedValue({})
})

describe("expense-category Zod validation", () => {
  it("create rejects empty name without touching DB", async () => {
    const res = await createExpenseCategory(fd({ name: "", label: "CSR" }))
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("Validasi gagal")
    expect(expenseCategoryCreateMock).not.toHaveBeenCalled()
  })

  it("create rejects oversized label without touching DB", async () => {
    const res = await createExpenseCategory(fd({ name: "csr", label: "x".repeat(5000) }))
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("Validasi gagal")
    expect(expenseCategoryCreateMock).not.toHaveBeenCalled()
  })

  it("create rejects garbage sortOrder without touching DB", async () => {
    const res = await createExpenseCategory(fd({ name: "csr", label: "CSR", sortOrder: "abc" }))
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("Validasi gagal")
    expect(expenseCategoryCreateMock).not.toHaveBeenCalled()
  })

  it("update rejects empty label without touching DB", async () => {
    const res = await updateExpenseCategory(1, fd({ name: "csr", label: "" }))
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain("Validasi gagal")
    expect(expenseCategoryUpdateMock).not.toHaveBeenCalled()
  })

  it("update passes validated fields to DB", async () => {
    const res = await updateExpenseCategory(1, fd({ name: "csr", label: "CSR", sortOrder: "3", isActive: "on" }))
    expect(res.success).toBe(true)
    expect(expenseCategoryUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "csr", label: "CSR", sortOrder: 3, isActive: true }),
      }),
    )
  })
})
