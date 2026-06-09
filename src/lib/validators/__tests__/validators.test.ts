import { describe, it, expect } from "vitest"
import {
  loginSchema,
  changePasswordSchema,
  customerSchema,
  itemSchema,
  inventoryTransferSchema,
  journalEntrySchema,
  quotationItemSchema,
  accountSchema,
  employeeSchema,
} from "../index"

describe("loginSchema", () => {
  it("accepts valid login", () => {
    const result = loginSchema.safeParse({ email: "user@example.com", password: "secret123" })
    expect(result.success).toBe(true)
  })

  it("rejects invalid email", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "secret" })
    expect(result.success).toBe(false)
  })

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({ email: "user@example.com", password: "" })
    expect(result.success).toBe(false)
  })
})

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
  it("accepts valid item", () => {
    const result = itemSchema.safeParse({ name: "Oli Mesin", cost: 50000, price: 75000 })
    expect(result.success).toBe(true)
  })

  it("rejects price lower than cost", () => {
    const result = itemSchema.safeParse({ name: "Oli", cost: 100000, price: 50000 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("price")
    }
  })

  it("accepts price equal to cost", () => {
    const result = itemSchema.safeParse({ name: "Item", cost: 10000, price: 10000 })
    expect(result.success).toBe(true)
  })

  it("rejects negative cost", () => {
    const result = itemSchema.safeParse({ name: "Item", cost: -1, price: 0 })
    expect(result.success).toBe(false)
  })
})

describe("inventoryTransferSchema", () => {
  it("accepts valid transfer (different warehouses)", () => {
    const result = inventoryTransferSchema.safeParse({
      sourceWarehouseId: 1,
      destinationWarehouseId: 2,
      date: "2026-01-15",
    })
    expect(result.success).toBe(true)
  })

  it("rejects same source and destination warehouse", () => {
    const result = inventoryTransferSchema.safeParse({
      sourceWarehouseId: 1,
      destinationWarehouseId: 1,
      date: "2026-01-15",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("destinationWarehouseId")
    }
  })

  it("rejects missing date", () => {
    const result = inventoryTransferSchema.safeParse({
      sourceWarehouseId: 1,
      destinationWarehouseId: 2,
      date: "",
    })
    expect(result.success).toBe(false)
  })
})

describe("journalEntrySchema", () => {
  it("accepts valid debit entry", () => {
    const result = journalEntrySchema.safeParse({ accountId: 1, debit: 100000, credit: 0 })
    expect(result.success).toBe(true)
  })

  it("accepts valid credit entry", () => {
    const result = journalEntrySchema.safeParse({ accountId: 1, debit: 0, credit: 50000 })
    expect(result.success).toBe(true)
  })

  it("rejects entry with both debit and credit = 0", () => {
    const result = journalEntrySchema.safeParse({ accountId: 1, debit: 0, credit: 0 })
    expect(result.success).toBe(false)
  })

  it("rejects negative debit", () => {
    const result = journalEntrySchema.safeParse({ accountId: 1, debit: -100, credit: 0 })
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

describe("accountSchema", () => {
  it("accepts valid account", () => {
    const result = accountSchema.safeParse({ name: "Kas", type: "ASSET" })
    expect(result.success).toBe(true)
  })

  it("rejects invalid account type", () => {
    const result = accountSchema.safeParse({ name: "Test", type: "INVALID" })
    expect(result.success).toBe(false)
  })

  it("rejects empty name", () => {
    const result = accountSchema.safeParse({ name: "", type: "REVENUE" })
    expect(result.success).toBe(false)
  })
})

describe("changePasswordSchema", () => {
  it("accepts matching passwords", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "old123",
      newPassword: "newpass88",
      confirmPassword: "newpass88",
    })
    expect(result.success).toBe(true)
  })

  it("rejects mismatched confirm password", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "old123",
      newPassword: "newpass88",
      confirmPassword: "different",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("confirmPassword")
    }
  })

  it("rejects short new password", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "old",
      newPassword: "short",
      confirmPassword: "short",
    })
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
})
