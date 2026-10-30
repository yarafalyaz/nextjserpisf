import { describe, it, expect, vi, beforeEach } from "vitest"

// attachment-permissions.ts carries `import "server-only"` (it holds the
// server-side attachment authorization helpers), which throws in a non
// react-server environment. Same stub the db/backup tests use.
vi.mock("server-only", () => ({}))

const hasPermissionMock = vi.fn()
const documentFindUniqueMock = vi.fn()
const taxDocumentFindUniqueMock = vi.fn()
const taxParentFindUniqueMock = vi.fn()
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
    warrantyClaim: { findUnique: (...a: unknown[]) => documentFindUniqueMock(...a) },
    taxAssessment: { findUnique: (...a: unknown[]) => taxParentFindUniqueMock(...a) },
    taxDisputeStep: { findUnique: (...a: unknown[]) => taxDocumentFindUniqueMock(...a) },
    userWarehouse: { findMany: (...a: unknown[]) => warehouseAssignmentsMock(...a) },
  },
}))

import { canAccessAttachment, ATTACHMENT_PERMISSION } from "../attachment-permissions"

beforeEach(() => {
  hasPermissionMock.mockReset()
  documentFindUniqueMock.mockReset()
  taxDocumentFindUniqueMock.mockReset()
  taxParentFindUniqueMock.mockReset()
  authMock.mockReset()
  warehouseAssignmentsMock.mockReset()
  documentFindUniqueMock.mockResolvedValue({ id: 1 })
  taxDocumentFindUniqueMock.mockResolvedValue({ id: 1, assessmentId: 9 })
  taxParentFindUniqueMock.mockResolvedValue({ id: 9, deletedAt: null })
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

  it("R6PA-02: menolak lampiran dokumen induk soft-deleted", async () => {
    hasPermissionMock.mockResolvedValue(true)
    documentFindUniqueMock.mockResolvedValue({ id: 1, deletedAt: new Date("2026-10-01") })
    await expect(canAccessAttachment("sales_invoice", 1)).resolves.toBe(false)
    await expect(canAccessAttachment("vendor_bill", 1)).resolves.toBe(false)
  })

  it("R6PA-02: dokumen hidup (deletedAt null / model tanpa kolom) tetap lolos", async () => {
    hasPermissionMock.mockResolvedValue(true)
    documentFindUniqueMock.mockResolvedValue({ id: 1, deletedAt: null })
    await expect(canAccessAttachment("sales_invoice", 1)).resolves.toBe(true)
    documentFindUniqueMock.mockResolvedValue({ id: 1 })
    await expect(canAccessAttachment("vendor_bill", 1)).resolves.toBe(true)
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

  it("memakai izin lihat klaim garansi untuk lampiran bukti WarrantyClaim", async () => {
    hasPermissionMock.mockResolvedValue(true)
    await expect(canAccessAttachment("WarrantyClaim", 1)).resolves.toBe(true)
    expect(hasPermissionMock).toHaveBeenCalledWith("view_warranty_claims")
  })

  it("maps every reference type to a view_ permission", () => {
    for (const [refType, perm] of Object.entries(ATTACHMENT_PERMISSION)) {
      expect(perm.startsWith("view_"), `${refType} -> ${perm}`).toBe(true)
    }
  })

  it("R7API-01: lampiran ketetapan pajak memakai view_tax_disputes (dulu selalu ditolak)", async () => {
    hasPermissionMock.mockResolvedValue(true)
    await expect(canAccessAttachment("tax_assessment", 9)).resolves.toBe(true)
    expect(hasPermissionMock).toHaveBeenCalledWith("view_tax_disputes")
    expect(taxParentFindUniqueMock).toHaveBeenCalled()
  })

  it("R7API-01: ketetapan terhapus menutup lampirannya walau izin ada", async () => {
    hasPermissionMock.mockResolvedValue(true)
    taxParentFindUniqueMock.mockResolvedValue({ id: 9, deletedAt: new Date("2026-10-01") })
    await expect(canAccessAttachment("tax_assessment", 9)).resolves.toBe(false)
  })

  it("R7API-01: lampiran langkah sengketa lolos bila langkah + ketetapan hidup", async () => {
    hasPermissionMock.mockResolvedValue(true)
    await expect(canAccessAttachment("tax_dispute_step", 1)).resolves.toBe(true)
    expect(taxDocumentFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ assessmentId: true }) }),
    )
    expect(taxParentFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 9 } }),
    )
  })

  it("R7API-01: ketetapan induk terhapus menutup lampiran langkahnya", async () => {
    hasPermissionMock.mockResolvedValue(true)
    taxParentFindUniqueMock.mockResolvedValue({ id: 9, deletedAt: new Date("2026-10-01") })
    await expect(canAccessAttachment("tax_dispute_step", 1)).resolves.toBe(false)
  })

  it("R7API-01: tanpa view_tax_disputes lampiran sengketa tetap ditolak", async () => {
    hasPermissionMock.mockResolvedValue(false)
    await expect(canAccessAttachment("tax_dispute_step", 1)).resolves.toBe(false)
  })
})
