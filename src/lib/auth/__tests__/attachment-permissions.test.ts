import { describe, it, expect, vi, beforeEach } from "vitest"

// attachment-permissions.ts carries `import "server-only"` (it holds the
// server-side attachment authorization helpers), which throws in a non
// react-server environment. Same stub the db/backup tests use.
vi.mock("server-only", () => ({}))

const hasPermissionMock = vi.fn()
const documentFindUniqueMock = vi.fn()
const authMock = vi.fn()
const warehouseAssignmentsMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  hasPermission: (...a: unknown[]) => hasPermissionMock(...a),
}))
vi.mock("@/lib/auth/auth", () => ({
  auth: (...a: unknown[]) => authMock(...a),
}))
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    salesInvoice: { findUnique: (...a: unknown[]) => documentFindUniqueMock(...a) },
    vendorBill: { findUnique: (...a: unknown[]) => documentFindUniqueMock(...a) },
    stockAdjustment: { findUnique: (...a: unknown[]) => documentFindUniqueMock(...a) },
    userWarehouse: { findMany: (...a: unknown[]) => warehouseAssignmentsMock(...a) },
  },
}))

import { canAccessAttachment, ATTACHMENT_PERMISSION } from "../attachment-permissions"

beforeEach(() => {
  hasPermissionMock.mockReset()
  documentFindUniqueMock.mockReset()
  authMock.mockReset()
  warehouseAssignmentsMock.mockReset()
  documentFindUniqueMock.mockResolvedValue({ id: 1 })
  authMock.mockResolvedValue({ user: { id: 1, roles: [] } })
  warehouseAssignmentsMock.mockResolvedValue([])
})

describe("canAccessAttachment", () => {
  it("denies an unknown reference type without calling hasPermission (fail-closed)", async () => {
    const ok = await canAccessAttachment("not_a_real_type", 1)
    expect(ok).toBe(false)
    expect(hasPermissionMock).not.toHaveBeenCalled()
  })

  it("checks the mapped view-permission for a known reference type", async () => {
    hasPermissionMock.mockResolvedValue(true)
    const ok = await canAccessAttachment("sales_invoice", 1)
    expect(ok).toBe(true)
    expect(hasPermissionMock).toHaveBeenCalledWith("view_sales_invoices")
  })

  it("denies when the user lacks the mapped permission", async () => {
    hasPermissionMock.mockResolvedValue(false)
    const ok = await canAccessAttachment("vendor_bill", 1)
    expect(ok).toBe(false)
    expect(hasPermissionMock).toHaveBeenCalledWith("view_vendor_bills")
  })

  it("denies a missing document even when the module permission is present", async () => {
    hasPermissionMock.mockResolvedValue(true)
    documentFindUniqueMock.mockResolvedValue(null)
    await expect(canAccessAttachment("sales_invoice", 1)).resolves.toBe(false)
  })

  it("denies warehouse documents outside the user's assigned warehouses", async () => {
    hasPermissionMock.mockResolvedValue(true)
    documentFindUniqueMock.mockResolvedValue({ id: 1, warehouseId: 12 })
    authMock.mockResolvedValue({ user: { id: 1, roles: ["warehouse_user"] } })
    warehouseAssignmentsMock.mockResolvedValue([{ warehouseId: 4 }])
    await expect(canAccessAttachment("stock_adjustment", 1)).resolves.toBe(false)
  })

  it("allows warehouse documents within the user's assigned warehouses", async () => {
    hasPermissionMock.mockResolvedValue(true)
    documentFindUniqueMock.mockResolvedValue({ id: 1, warehouseId: 4 })
    authMock.mockResolvedValue({ user: { id: 1, roles: ["warehouse_user"] } })
    warehouseAssignmentsMock.mockResolvedValue([{ warehouseId: 4 }])
    await expect(canAccessAttachment("stock_adjustment", 1)).resolves.toBe(true)
  })

  it("maps every reference type to a view_ permission", () => {
    for (const [refType, perm] of Object.entries(ATTACHMENT_PERMISSION)) {
      expect(perm.startsWith("view_"), `${refType} -> ${perm}`).toBe(true)
    }
  })
})
