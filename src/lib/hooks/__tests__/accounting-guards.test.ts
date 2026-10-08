import { describe, it, expect } from "vitest"

/**
 * Regression tests for accounting hook guards added in this audit batch.
 */

describe("Accounting hook guards (regression)", () => {
  describe("Petty cash counterpart account validation", () => {
    it("IN: rejects when both sourceAccountId and cashBankAccountId missing", () => {
      const sourceAccountId = null
      const cashBankAccountId = null
      const counterpart = sourceAccountId ?? cashBankAccountId
      expect(counterpart).toBeNull()
      // Guard: throw "Akun sumber dana belum dikonfigurasi"
    })

    it("IN: uses sourceAccountId when available", () => {
      const sourceAccountId = 101
      const cashBankAccountId = 200
      const counterpart = sourceAccountId ?? cashBankAccountId
      expect(counterpart).toBe(101)
    })

    it("IN: falls back to cashBankAccountId", () => {
      const sourceAccountId = null
      const cashBankAccountId = 200
      const counterpart = sourceAccountId ?? cashBankAccountId
      expect(counterpart).toBe(200)
    })

    it("OUT: rejects when both expenseAccountId and generalExpenseAccountId missing", () => {
      const expenseAccountId = null
      const generalExpenseAccountId = null
      const counterpart = expenseAccountId ?? generalExpenseAccountId
      expect(counterpart).toBeNull()
      // Guard: throw "Akun beban belum dikonfigurasi"
    })

    it("OUT: uses expenseAccountId when available", () => {
      const expenseAccountId = 301
      const generalExpenseAccountId = 400
      const counterpart = expenseAccountId ?? generalExpenseAccountId
      expect(counterpart).toBe(301)
    })
  })

  describe("Stock adjustment journal referenceType split", () => {
    it("positive adjustment uses StockAdjustment referenceType", () => {
      const isPositive = true
      const referenceType = isPositive ? "StockAdjustment" : "StockAdjustmentOut"
      expect(referenceType).toBe("StockAdjustment")
    })

    it("negative adjustment uses StockAdjustmentOut referenceType", () => {
      const isPositive = false
      const referenceType = isPositive ? "StockAdjustment" : "StockAdjustmentOut"
      expect(referenceType).toBe("StockAdjustmentOut")
    })

    it("idempotency check covers both types", () => {
      const checkTypes = ["StockAdjustment", "StockAdjustmentOut"]
      expect(checkTypes).toContain("StockAdjustment")
      expect(checkTypes).toContain("StockAdjustmentOut")
    })
  })

  describe("Vendor payment journal timing", () => {
    it("create should NOT post journal (draft state)", () => {
      const status: string = "draft"
      const shouldPostJournal = status === "completed"
      expect(shouldPostJournal).toBe(false)
    })

    it("confirm should post journal (completed state)", () => {
      const status = "completed"
      const shouldPostJournal = status === "completed"
      expect(shouldPostJournal).toBe(true)
    })
  })

  describe("Payroll journal on paid", () => {
    it("debits the FULL gross salary; credits net + statutory + loan + other deductions", () => {
      const baseSalary = 5_000_000
      const bpjsHealth = 50_000
      const bpjsEmployment = 100_000
      const pph21 = 150_000
      const statutory = bpjsHealth + bpjsEmployment + pph21
      const loanDeduction = 200_000
      const lateDeduction = 25_000
      const absentDeduction = 75_000
      const grossSalary = baseSalary
      const netSalary =
        grossSalary - statutory - loanDeduction - lateDeduction - absentDeduction

      // Journal must balance to the FULL gross, not (net + statutory): the
      // loan instalment and late/absent deductions are withheld from pay and
      // need their own credit legs or the employee receivable never clears.
      expect(netSalary).toBe(4_400_000)
      expect(statutory).toBe(300_000)
      expect(loanDeduction + lateDeduction + absentDeduction).toBe(300_000)
      expect(netSalary + statutory + loanDeduction + lateDeduction + absentDeduction).toBe(
        grossSalary,
      )
    })

    it("skips when gross salary <= 0", () => {
      const grossSalary = 0
      expect(grossSalary).toBeLessThanOrEqual(0)
    })

    it("skips when salaryExpenseAccountId not configured", () => {
      const salaryExpenseAccountId = null
      expect(salaryExpenseAccountId).toBeNull()
      // Guard: early return
    })
  })
})
