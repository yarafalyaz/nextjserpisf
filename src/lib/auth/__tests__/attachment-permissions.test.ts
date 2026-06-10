import { describe, it, expect, vi, beforeEach } from "vitest"

const hasPermissionMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  hasPermission: (...a: unknown[]) => hasPermissionMock(...a),
}))

import { canAccessAttachment, ATTACHMENT_PERMISSION } from "../attachment-permissions"

beforeEach(() => {
  hasPermissionMock.mockReset()
})

describe("canAccessAttachment", () => {
  it("denies an unknown reference type without calling hasPermission (fail-closed)", async () => {
    const ok = await canAccessAttachment("not_a_real_type")
    expect(ok).toBe(false)
    expect(hasPermissionMock).not.toHaveBeenCalled()
  })

  it("checks the mapped view-permission for a known reference type", async () => {
    hasPermissionMock.mockResolvedValue(true)
    const ok = await canAccessAttachment("sales_invoice")
    expect(ok).toBe(true)
    expect(hasPermissionMock).toHaveBeenCalledWith("view_sales_invoices")
  })

  it("denies when the user lacks the mapped permission", async () => {
    hasPermissionMock.mockResolvedValue(false)
    const ok = await canAccessAttachment("vendor_bill")
    expect(ok).toBe(false)
    expect(hasPermissionMock).toHaveBeenCalledWith("view_vendor_bills")
  })

  it("maps every reference type to a view_ permission", () => {
    for (const [refType, perm] of Object.entries(ATTACHMENT_PERMISSION)) {
      expect(perm.startsWith("view_"), `${refType} -> ${perm}`).toBe(true)
    }
  })
})
