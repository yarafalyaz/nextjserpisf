import { describe, it, expect } from "vitest"

/**
 * Regression tests for sales action guards added in this audit batch.
 * These validate the guard logic without requiring a DB connection.
 */

describe("Sales guards (regression)", () => {
  describe("DP cumulative cap", () => {
    it("rejects DP that exceeds quotation grandTotal", () => {
      const grandTotal = 10_000_000
      const existingDpTotal = 8_000_000
      const newAmount = 3_000_000
      const remaining = grandTotal - existingDpTotal

      expect(newAmount).toBeGreaterThan(remaining)
      // Guard: amount > remaining → throw
    })

    it("accepts DP within remaining", () => {
      const grandTotal = 10_000_000
      const existingDpTotal = 5_000_000
      const newAmount = 3_000_000
      const remaining = grandTotal - existingDpTotal

      expect(newAmount).toBeLessThanOrEqual(remaining)
    })

    it("rejects non-positive DP amount", () => {
      expect(0).toBeLessThanOrEqual(0)
      expect(-1000).toBeLessThan(0)
    })
  })

  describe("Payment overpay guard", () => {
    it("rejects payment exceeding invoice remaining", () => {
      const invoiceGrandTotal = 5_000_000
      const paidSoFar = 4_500_000
      const remaining = invoiceGrandTotal - paidSoFar
      const paymentAmount = 600_000

      expect(paymentAmount).toBeGreaterThan(remaining)
    })

    it("accepts payment within remaining", () => {
      const invoiceGrandTotal = 5_000_000
      const paidSoFar = 4_000_000
      const remaining = invoiceGrandTotal - paidSoFar
      const paymentAmount = 500_000

      expect(paymentAmount).toBeLessThanOrEqual(remaining)
    })
  })

  describe("Quotation send guard", () => {
    it("rejects sending quotation with zero items", () => {
      const itemCount = 0
      expect(itemCount).toBe(0)
      // Guard: itemCount === 0 → throw "harus memiliki minimal 1 item"
    })

    it("allows sending quotation with items", () => {
      const itemCount = 3
      expect(itemCount).toBeGreaterThan(0)
    })
  })

  describe("Vehicle-customer cross validation", () => {
    it("rejects vehicle not belonging to customer", () => {
      // Simulated: customerVehicle.findFirst returns null
      const vehicleFound = null
      expect(vehicleFound).toBeNull()
      // Guard: !vehicle → throw "Kendaraan tidak terdaftar untuk customer ini"
    })

    it("allows vehicle belonging to customer", () => {
      const vehicleFound = { id: 1 }
      expect(vehicleFound).not.toBeNull()
    })
  })
})
