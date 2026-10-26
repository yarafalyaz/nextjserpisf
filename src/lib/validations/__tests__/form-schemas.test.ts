// @vitest-environment node
import { describe, it, expect } from "vitest"

import {
  customerSchema,
  itemSchema,
  employeeSchema,
  purchaseOrderSchema,
  quotationItemSchema,
} from "../form.schemas"

/**
 * Skema sisi-form (react-hook-form) — customer, item, karyawan, pesanan pembelian, item penawaran.
 *
 * Dipindahkan dari `src/lib/validators/__tests__/validators.test.ts` saat dua pohon
 * validasi disatukan (2026-10-13). Aturan yang diuji tidak berubah.
 */

describe("customerSchema", () => {
  it("accepts minimal valid customer (name only)", () => {
    const result = customerSchema.safeParse({ name: "PT Maju" })
    expect(result.success).toBe(true)
  })

  it("rejects empty name", () => {
    const result = customerSchema.safeParse({ name: "" })
    expect(result.success).toBe(false)
  })

  it("accepts optional email as empty string", () => {
    const result = customerSchema.safeParse({ name: "Test", email: "" })
    expect(result.success).toBe(true)
  })

  it("rejects invalid email format", () => {
    const result = customerSchema.safeParse({ name: "Test", email: "not-email" })
    expect(result.success).toBe(false)
  })
})

describe("itemSchema", () => {
  const baseItem = {
    image: "item.jpg",
    categoryId: 1,
    brandId: 1,
    vendorId: 1,
    defaultWarehouseId: 1,
    defaultRackId: 1,
  }

  it("accepts valid item", () => {
    const result = itemSchema.safeParse({ ...baseItem, name: "Oli Mesin", cost: 50000, price: 75000 })
    expect(result.success).toBe(true)
  })

  it("rejects price lower than cost", () => {
    const result = itemSchema.safeParse({ ...baseItem, name: "Oli", cost: 100000, price: 50000 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("price")
    }
  })

  it("accepts price equal to cost", () => {
    const result = itemSchema.safeParse({ ...baseItem, name: "Item", cost: 10000, price: 10000 })
    expect(result.success).toBe(true)
  })

  it("rejects negative cost", () => {
    const result = itemSchema.safeParse({ ...baseItem, name: "Item", cost: -1, price: 0 })
    expect(result.success).toBe(false)
  })
})

describe("quotationItemSchema", () => {
  it("accepts valid item", () => {
    const result = quotationItemSchema.safeParse({ qty: 2, unitPrice: 50000 })
    expect(result.success).toBe(true)
  })

  it("rejects qty of zero", () => {
    const result = quotationItemSchema.safeParse({ qty: 0, unitPrice: 10000 })
    expect(result.success).toBe(false)
  })

  it("rejects negative unitPrice", () => {
    const result = quotationItemSchema.safeParse({ qty: 1, unitPrice: -500 })
    expect(result.success).toBe(false)
  })
})

describe("employeeSchema", () => {
  it("accepts valid employee with string baseSalary (transform)", () => {
    const result = employeeSchema.safeParse({
      name: "Budi",
      joinDate: "2026-01-01",
      baseSalary: "5.000.000",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.baseSalary).toBe(5000000)
    }
  })

  it("accepts numeric baseSalary", () => {
    const result = employeeSchema.safeParse({
      name: "Andi",
      joinDate: "2026-01-01",
      baseSalary: 3500000,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.baseSalary).toBe(3500000)
    }
  })

  it("rejects missing name", () => {
    const result = employeeSchema.safeParse({
      name: "",
      joinDate: "2026-01-01",
    })
    expect(result.success).toBe(false)
  })

  it("rejects missing joinDate", () => {
    const result = employeeSchema.safeParse({
      name: "Test",
      joinDate: "",
    })
    expect(result.success).toBe(false)
  })

  it("accepts valid employee with login account flags", () => {
    const result = employeeSchema.safeParse({
      name: "Budi",
      joinDate: "2026-01-01",
      createLoginAccount: true,
      email: "budi@example.com",
      loginPassword: "kata-sandi-pegawai-kuat",
    })
    expect(result.success).toBe(true)
  })

  it("rejects login account if email is missing", () => {
    const result = employeeSchema.safeParse({
      name: "Budi",
      joinDate: "2026-01-01",
      createLoginAccount: true,
      email: "",
      loginPassword: "kata-sandi-pegawai-kuat",
    })
    expect(result.success).toBe(false)
  })
})

describe("purchaseOrderSchema", () => {
  it("accepts valid PO", () => {
    const result = purchaseOrderSchema.safeParse({ vendorId: 1, date: "2026-01-01" })
    expect(result.success).toBe(true)
  })
})
