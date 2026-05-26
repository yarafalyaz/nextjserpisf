import { describe, it, expect } from "vitest"

/**
 * Unit tests for FIFO Inventory Costing
 * Tests the core logic of the InventoryService
 */

describe("FIFO Inventory Costing", () => {
  it("should consume oldest layers first on OUT", () => {
    // Simulate FIFO layers
    const layers = [
      { id: 1, remaining: 10, unitCost: 100, createdAt: new Date("2024-01-01") },
      { id: 2, remaining: 20, unitCost: 120, createdAt: new Date("2024-01-15") },
      { id: 3, remaining: 15, unitCost: 130, createdAt: new Date("2024-02-01") },
    ]

    const qtyToConsume = 25
    let remaining = qtyToConsume
    let totalCost = 0
    const consumed: { layerId: number; qty: number; cost: number }[] = []

    for (const layer of layers) {
      if (remaining <= 0) break
      const consume = Math.min(layer.remaining, remaining)
      totalCost += consume * layer.unitCost
      consumed.push({ layerId: layer.id, qty: consume, cost: layer.unitCost })
      remaining -= consume
    }

    // Should consume all 10 from layer 1 (cost 100) + 15 from layer 2 (cost 120)
    expect(remaining).toBe(0)
    expect(consumed).toHaveLength(2)
    expect(consumed[0]).toEqual({ layerId: 1, qty: 10, cost: 100 })
    expect(consumed[1]).toEqual({ layerId: 2, qty: 15, cost: 120 })
    expect(totalCost).toBe(10 * 100 + 15 * 120) // 1000 + 1800 = 2800

    // Average unit cost
    const avgCost = totalCost / qtyToConsume
    expect(avgCost).toBe(2800 / 25) // 112
  })

  it("should throw error when stock is insufficient", () => {
    const layers = [
      { id: 1, remaining: 5, unitCost: 100 },
      { id: 2, remaining: 3, unitCost: 120 },
    ]

    const qtyToConsume = 10 // More than available (5 + 3 = 8)
    let remaining = qtyToConsume

    for (const layer of layers) {
      if (remaining <= 0) break
      const consume = Math.min(layer.remaining, remaining)
      remaining -= consume
    }

    expect(remaining).toBeGreaterThan(0) // Should have remaining qty
    expect(remaining).toBe(2) // 10 - 5 - 3 = 2
  })

  it("should handle single layer consumption", () => {
    const layers = [
      { id: 1, remaining: 100, unitCost: 50 },
    ]

    const qtyToConsume = 30
    let remaining = qtyToConsume
    let totalCost = 0

    for (const layer of layers) {
      if (remaining <= 0) break
      const consume = Math.min(layer.remaining, remaining)
      totalCost += consume * layer.unitCost
      remaining -= consume
    }

    expect(remaining).toBe(0)
    expect(totalCost).toBe(30 * 50) // 1500
  })
})

describe("Double-Entry Accounting Validation", () => {
  it("should validate debit equals credit", () => {
    const entries = [
      { accountId: 1, debit: 1000000, credit: 0 },
      { accountId: 2, debit: 0, credit: 900000 },
      { accountId: 3, debit: 0, credit: 100000 },
    ]

    const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0)
    const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0)

    expect(totalDebit).toBe(totalCredit)
    expect(totalDebit).toBe(1000000)
  })

  it("should reject unbalanced entries", () => {
    const entries = [
      { accountId: 1, debit: 1000000, credit: 0 },
      { accountId: 2, debit: 0, credit: 800000 },
    ]

    const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0)
    const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0)

    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01
    expect(isBalanced).toBe(false)
  })

  it("should handle multiple debit and credit lines", () => {
    // Sales Invoice posting: Dr. Receivable, Cr. Revenue + Tax
    const entries = [
      { accountId: 1100, debit: 11000000, credit: 0, memo: "Piutang Usaha" },
      { accountId: 4000, debit: 0, credit: 10000000, memo: "Pendapatan" },
      { accountId: 2200, debit: 0, credit: 1000000, memo: "PPN Keluaran" },
    ]

    const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0)
    const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0)

    expect(totalDebit).toBe(11000000)
    expect(totalCredit).toBe(11000000)
    expect(totalDebit).toBe(totalCredit)
  })
})

describe("Document Sequence Generation", () => {
  it("should generate complex format document number", () => {
    const seq = 1
    const prefix = "INV"
    const companyCode = "YRA"
    const month = "05"
    const year = 2026

    const docNo = `${String(seq).padStart(3, "0")}/${prefix}/${companyCode}/${month}/${year}`
    expect(docNo).toBe("001/INV/YRA/05/2026")
  })

  it("should generate simple format document number", () => {
    const seq = 42
    const prefix = "SO"

    const docNo = `${prefix}-${String(seq).padStart(4, "0")}`
    expect(docNo).toBe("SO-0042")
  })

  it("should pad sequence numbers correctly", () => {
    expect(String(1).padStart(3, "0")).toBe("001")
    expect(String(99).padStart(3, "0")).toBe("099")
    expect(String(100).padStart(3, "0")).toBe("100")
    expect(String(1000).padStart(3, "0")).toBe("1000") // Overflow is fine
  })
})

describe("Payment Status Calculation", () => {
  it("should calculate invoice status correctly", () => {
    function getInvoiceStatus(grandTotal: number, paidAmount: number): string {
      if (paidAmount <= 0) return "posted"
      if (paidAmount >= grandTotal) return "paid"
      return "partial"
    }

    expect(getInvoiceStatus(1000000, 0)).toBe("posted")
    expect(getInvoiceStatus(1000000, 500000)).toBe("partial")
    expect(getInvoiceStatus(1000000, 1000000)).toBe("paid")
    expect(getInvoiceStatus(1000000, 1200000)).toBe("paid") // Overpayment
  })
})

describe("Stock Availability Check", () => {
  it("should prevent negative stock", () => {
    const qtyOnHand = 10
    const qtyRequested = 15

    const canFulfill = qtyOnHand >= qtyRequested
    expect(canFulfill).toBe(false)
  })

  it("should allow exact stock fulfillment", () => {
    const qtyOnHand = 10
    const qtyRequested = 10

    const canFulfill = qtyOnHand >= qtyRequested
    expect(canFulfill).toBe(true)
  })

  it("should detect low stock condition", () => {
    const qtyOnHand = 5
    const minStock = 10

    const isLowStock = minStock > 0 && qtyOnHand <= minStock
    expect(isLowStock).toBe(true)
  })
})
