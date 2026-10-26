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

  it("rejects a password shorter than 12 characters", () => {
    const parsed = setupSchema.safeParse({
      ...base,
      adminPassword: "1234567",
      confirmPassword: "1234567",
    })
    expect(parsed.success).toBe(false)
  })

  it("rejects a common password at sufficient length", () => {
    const parsed = setupSchema.safeParse({
      ...base,
      adminPassword: "administrator",
      confirmPassword: "administrator",
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("terlalu umum")
    }
  })

  it("rejects a mismatched confirmation on the confirmPassword field", () => {
    const parsed = setupSchema.safeParse({ ...base, confirmPassword: "lain-sekali" })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.includes("confirmPassword"))).toBe(true)
    }
  })

  it("accepts phone numbers with digits and phone punctuation", () => {
    for (const companyPhone of ["0211234567", "021-1234567", "+62-21-555-0100", "(021) 555 0100"]) {
      expect(setupSchema.safeParse({ ...base, companyPhone }).success, companyPhone).toBe(true)
    }
  })

  it("rejects letters in the company phone number", () => {
    const parsed = setupSchema.safeParse({ ...base, companyPhone: "021-abc-123" })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("hanya boleh berisi angka")
    }
  })
})
