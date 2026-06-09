import { describe, it, expect } from "vitest"
import { z } from "zod"
import { parseFormData } from "../parse-form"

function makeFormData(obj: Record<string, string>): FormData {
  const fd = new FormData()
  Object.entries(obj).forEach(([k, v]) => fd.append(k, v))
  return fd
}

describe("parseFormData", () => {
  describe("numeric coercion", () => {
    const schema = z.object({
      amount: z.number(),
      name: z.string(),
    })

    it("coerces '0' to number 0", () => {
      const result = parseFormData(schema, makeFormData({ amount: "0", name: "test" }))
      expect(result).toEqual({ success: true, data: { amount: 0, name: "test" } })
    })

    it("coerces '123' to number 123", () => {
      const result = parseFormData(schema, makeFormData({ amount: "123", name: "test" }))
      expect(result).toEqual({ success: true, data: { amount: 123, name: "test" } })
    })

    it("coerces '0.5' to number 0.5", () => {
      const schema2 = z.object({ val: z.number() })
      const result = parseFormData(schema2, makeFormData({ val: "0.5" }))
      expect(result).toEqual({ success: true, data: { val: 0.5 } })
    })

    it("coerces '-10' to number -10", () => {
      const schema2 = z.object({ val: z.number() })
      const result = parseFormData(schema2, makeFormData({ val: "-10" }))
      expect(result).toEqual({ success: true, data: { val: -10 } })
    })

    it("preserves leading-zero strings as string (phone numbers)", () => {
      const schema2 = z.object({ phone: z.string() })
      const result = parseFormData(schema2, makeFormData({ phone: "081234567890" }))
      expect(result).toEqual({ success: true, data: { phone: "081234567890" } })
    })

    it("preserves '00' as string", () => {
      const schema2 = z.object({ val: z.string() })
      const result = parseFormData(schema2, makeFormData({ val: "00" }))
      expect(result).toEqual({ success: true, data: { val: "00" } })
    })

    it("preserves '01' as string (not octal)", () => {
      const schema2 = z.object({ val: z.string() })
      const result = parseFormData(schema2, makeFormData({ val: "01" }))
      expect(result).toEqual({ success: true, data: { val: "01" } })
    })
  })

  describe("boolean coercion", () => {
    const schema = z.object({ active: z.boolean() })

    it("coerces 'true' to true", () => {
      const result = parseFormData(schema, makeFormData({ active: "true" }))
      expect(result).toEqual({ success: true, data: { active: true } })
    })

    it("coerces 'on' to true (checkbox)", () => {
      const result = parseFormData(schema, makeFormData({ active: "on" }))
      expect(result).toEqual({ success: true, data: { active: true } })
    })

    it("coerces 'false' to false", () => {
      const result = parseFormData(schema, makeFormData({ active: "false" }))
      expect(result).toEqual({ success: true, data: { active: false } })
    })

    it("coerces 'off' to false", () => {
      const result = parseFormData(schema, makeFormData({ active: "off" }))
      expect(result).toEqual({ success: true, data: { active: false } })
    })
  })

  describe("empty string → undefined", () => {
    const schema = z.object({
      name: z.string().min(1),
      email: z.string().email().optional(),
    })

    it("treats empty string as undefined (allows optional fields)", () => {
      const result = parseFormData(schema, makeFormData({ name: "Test", email: "" }))
      expect(result).toEqual({ success: true, data: { name: "Test" } })
    })

    it("treats whitespace-only as undefined", () => {
      const result = parseFormData(schema, makeFormData({ name: "Test", email: "   " }))
      expect(result).toEqual({ success: true, data: { name: "Test" } })
    })
  })

  describe("validation errors", () => {
    const schema = z.object({
      name: z.string().min(1, "Nama wajib diisi"),
      amount: z.number({ message: "Harus angka" }),
    })

    it("returns error on validation failure", () => {
      const result = parseFormData(schema, makeFormData({ name: "", amount: "abc" }))
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain("Validasi gagal")
      }
    })
  })

  describe("real-world: customer creditLimit", () => {
    const customerSchema = z.object({
      name: z.string().min(1),
      phone: z.string().optional(),
      creditLimit: z.number().optional(),
    })

    it("handles creditLimit: '0' correctly", () => {
      const result = parseFormData(customerSchema, makeFormData({
        name: "Customer Test",
        phone: "081234567890",
        creditLimit: "0",
      }))
      expect(result).toEqual({
        success: true,
        data: { name: "Customer Test", phone: "081234567890", creditLimit: 0 },
      })
    })

    it("handles creditLimit: '5000000' correctly", () => {
      const result = parseFormData(customerSchema, makeFormData({
        name: "Customer Test",
        phone: "081234567890",
        creditLimit: "5000000",
      }))
      expect(result).toEqual({
        success: true,
        data: { name: "Customer Test", phone: "081234567890", creditLimit: 5000000 },
      })
    })
  })
})
