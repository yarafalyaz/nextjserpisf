import { describe, it, expect } from "vitest"
import { setupSchema } from "../setup.schemas"

const base = {
  companyName: "PT Sumber Makmur",
  adminName: "Budi Santoso",
  adminEmail: "admin@isf.co.id",
  adminPassword: "rahasia12345",
  confirmPassword: "rahasia12345",
}

describe("setupSchema", () => {
  it("accepts a valid payload", () => {
    expect(setupSchema.safeParse(base).success).toBe(true)
  })

  it("requires the company name", () => {
    expect(setupSchema.safeParse({ ...base, companyName: "" }).success).toBe(false)
  })

  it("rejects an invalid administrator email", () => {
    expect(setupSchema.safeParse({ ...base, adminEmail: "bukan-email" }).success).toBe(false)
  })

  it("rejects a password shorter than 8 characters", () => {
    const parsed = setupSchema.safeParse({
      ...base,
      adminPassword: "1234567",
      confirmPassword: "1234567",
    })
    expect(parsed.success).toBe(false)
  })

  it("rejects a mismatched confirmation on the confirmPassword field", () => {
    const parsed = setupSchema.safeParse({ ...base, confirmPassword: "lain-sekali" })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.includes("confirmPassword"))).toBe(true)
    }
  })
})
