import { describe, it, expect } from "vitest"
import { getApprovalDocDelegate, isApprovalDocModelKey } from "../approval-models"

describe("approval-models allowlist guard", () => {
  it("allows valid approval models", () => {
    expect(isApprovalDocModelKey("quotation")).toBe(true)
    expect(isApprovalDocModelKey("leaveRequest")).toBe(true)
    expect(isApprovalDocModelKey("salesOrder")).toBe(true)
  })

  it("rejects unauthorized models", () => {
    expect(isApprovalDocModelKey("user")).toBe(false)
    expect(isApprovalDocModelKey("session")).toBe(false)
    expect(isApprovalDocModelKey("account")).toBe(false)
    expect(isApprovalDocModelKey("password")).toBe(false)
  })

  it("getApprovalDocDelegate returns delegate for valid model and null for unauthorized", () => {
    const fakeDb = {
      quotation: { findUnique: () => Promise.resolve({ id: 1 }) },
      user: { findUnique: () => Promise.resolve({ id: 99 }) },
    } as any

    expect(getApprovalDocDelegate(fakeDb, "Quotation")).not.toBeNull()
    expect(getApprovalDocDelegate(fakeDb, "quotation")).not.toBeNull()
    expect(getApprovalDocDelegate(fakeDb, "User")).toBeNull()
    expect(getApprovalDocDelegate(fakeDb, "user")).toBeNull()
  })
})
