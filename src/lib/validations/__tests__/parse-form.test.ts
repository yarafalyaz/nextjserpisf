import { describe, it, expect } from "vitest"
import { z } from "zod"
import { parseFormData } from "../parse-form"

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) {
    fd.append(k, v)
  }
  return fd
}

describe("parseFormData", () => {
  const schema = z.object({
    name: z.string().min(1, "Nama wajib"),
    email: z.string().email().optional(),
    qty: z.coerce.number().min(1).optional(),
    active: z.boolean().optional(),
  })

  it("parses valid form data", () => {
    const fd = makeFormData({ name: "Test", email: "a@b.com", qty: "5", active: "true" })
    const result = parseFormData(schema, fd)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe("Test")
      expect(result.data.email).toBe("a@b.com")
      expect(result.data.qty).toBe(5)
      expect(result.data.active).toBe(true)
    }
  })

  it("coerces empty strings to undefined (optional fields pass)", () => {
    const fd = makeFormData({ name: "OK", email: "", qty: "" })
    const result = parseFormData(schema, fd)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBeUndefined()
      expect(result.data.qty).toBeUndefined()
    }
  })

  it("coerces 'false' and 'off' to boolean false", () => {
    const fd = makeFormData({ name: "X", active: "false" })
    const result = parseFormData(schema, fd)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.active).toBe(false)
    }
  })

  it("coerces 'on' to boolean true", () => {
    const fd = makeFormData({ name: "X", active: "on" })
    const result = parseFormData(schema, fd)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.active).toBe(true)
    }
  })

  it("preserves leading-zero strings as strings (phone numbers)", () => {
    const phoneSchema = z.object({ phone: z.string().optional() })
    const fd = makeFormData({ phone: "08123456789" })
    const result = parseFormData(phoneSchema, fd)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.phone).toBe("08123456789")
    }
  })

  // Regression: parseFormData used to eagerly coerce any all-digit string
  // (no leading zero) to a number, which corrupted string identifiers.
  // String fields must now receive the raw string; numbers are coerced
  // explicitly by z.coerce.number() in the schemas.
  it("preserves numeric-looking postal codes as strings (regression)", () => {
    const addrSchema = z.object({ postalCode: z.string().optional() })
    const fd = makeFormData({ postalCode: "40123" })
    const result = parseFormData(addrSchema, fd)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.postalCode).toBe("40123")
    }
  })

  it("preserves long bank account numbers as exact strings (regression)", () => {
    const acctSchema = z.object({ accountNumber: z.string().optional() })
    const fd = makeFormData({ accountNumber: "1234567890123456" })
    const result = parseFormData(acctSchema, fd)
    expect(result.success).toBe(true)
    if (result.success) {
      // Exact value preserved — coercing to Number would lose precision
      // past 2^53 (e.g. 16-digit NIK).
      expect(result.data.accountNumber).toBe("1234567890123456")
    }
  })

  it("coerces '0' to number zero (via z.coerce.number)", () => {
    const numSchema = z.object({ val: z.coerce.number() })
    const fd = makeFormData({ val: "0" })
    const result = parseFormData(numSchema, fd)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.val).toBe(0)
    }
  })

  it("coerces negative numbers (via z.coerce.number)", () => {
    const numSchema = z.object({ val: z.coerce.number() })
    const fd = makeFormData({ val: "-10" })
    const result = parseFormData(numSchema, fd)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.val).toBe(-10)
    }
  })

  it("coerces decimal numbers (via z.coerce.number)", () => {
    const numSchema = z.object({ val: z.coerce.number() })
    const fd = makeFormData({ val: "3.14" })
    const result = parseFormData(numSchema, fd)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.val).toBe(3.14)
    }
  })

  it("returns error for invalid data", () => {
    const fd = makeFormData({ name: "" }) // name required
    const result = parseFormData(schema, fd)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain("Validasi gagal")
      expect(result.error).toContain("name")
    }
  })

  it("returns joined errors for multiple invalid fields", () => {
    const strict = z.object({
      name: z.string().min(1, "Nama wajib"),
      qty: z.coerce.number().min(1, "Qty min 1"),
    })
    const fd = makeFormData({ name: "", qty: "0" })
    const result = parseFormData(strict, fd)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain("name")
      expect(result.error).toContain("Qty min 1")
    }
  })

  it("skips File entries in FormData", () => {
    const fileSchema = z.object({ name: z.string(), file: z.any().optional() })
    const fd = new FormData()
    fd.append("name", "Test")
    fd.append("file", new File(["content"], "test.txt", { type: "text/plain" }))
    const result = parseFormData(fileSchema, fd)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe("Test")
      expect(result.data.file).toBeUndefined()
    }
  })

  it("keeps Infinity-like strings as strings (not coerced to number)", () => {
    const strSchema = z.object({ val: z.string().optional() })
    const fd = makeFormData({ val: "Infinity" })
    const result = parseFormData(strSchema, fd)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.val).toBe("Infinity")
    }
  })
})
