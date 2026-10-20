import { describe, expect, it } from "vitest"
import {
  effectiveDiscountPercent,
  evaluateQuotationApprovalGate,
  parseApprovalThresholds,
} from "../quotation-approval-gate"

describe("quotation-approval-gate (F-2026-10-20-100 lapis aman)", () => {
  it("tanpa conditions: tidak dievaluasi, mundur kompatibel", () => {
    const gate = evaluateQuotationApprovalGate(
      { subtotal: 80_000_000, discount: 20_000_000, grandTotal: 85_000_000 },
      [{ stepOrder: 1, name: "Supervisor", conditions: null }],
    )
    expect(gate.hasConfiguredThresholds).toBe(false)
    expect(gate.requiresApproval).toBe(false)
    expect(gate.steps[0].evaluated).toBe(false)
  })

  it("persen efektif dari diskon header terhadap nilai sebelum diskon header", () => {
    // subtotal neto baris 75jt + diskon header 25jt -> 25% dari 100jt.
    expect(effectiveDiscountPercent({ subtotal: 75, discount: 25, grandTotal: 80 })).toBe(25)
    expect(effectiveDiscountPercent({ subtotal: 100, discount: 0, grandTotal: 100 })).toBe(0)
    expect(effectiveDiscountPercent({ subtotal: 0, discount: 0, grandTotal: 0 })).toBe(0)
  })

  it("logika DAN: diskon lewat ambang tetapi nominal di bawah -> tidak terpicu", () => {
    const gate = evaluateQuotationApprovalGate(
      { subtotal: 75_000_000, discount: 25_000_000, grandTotal: 80_000_000 },
      [
        {
          stepOrder: 1,
          conditions: { minDiscountPercent: 20, minAmount: 100_000_000 },
        },
      ],
    )
    expect(gate.discountPercent).toBe(25)
    expect(gate.steps[0].triggered).toBe(false)
    expect(gate.requiresApproval).toBe(false)
  })

  it("logika DAN: diskon dan nominal sama-sama lewat -> terpicu (penanda saja)", () => {
    const gate = evaluateQuotationApprovalGate(
      { subtotal: 75_000_000, discount: 25_000_000, grandTotal: 110_000_000 },
      [
        {
          stepOrder: 1,
          conditions: { minDiscountPercent: 20, minAmount: 100_000_000 },
        },
      ],
    )
    expect(gate.steps[0].triggered).toBe(true)
    expect(gate.requiresApproval).toBe(true)
  })

  it("satu ambang saja: ambang itu yang menilai", () => {
    const byPercent = evaluateQuotationApprovalGate(
      { subtotal: 90, discount: 10, grandTotal: 95 },
      [{ stepOrder: 1, conditions: { minDiscountPercent: 10 } }],
    )
    expect(byPercent.steps[0].triggered).toBe(true)

    const byAmount = evaluateQuotationApprovalGate(
      { subtotal: 90, discount: 10, grandTotal: 95 },
      [{ stepOrder: 1, conditions: { minAmount: 100 } }],
    )
    expect(byAmount.steps[0].triggered).toBe(false)
  })

  it("conditions kotor diabaikan, bukan ditebak", () => {
    expect(parseApprovalThresholds({ minDiscountPercent: "abc", minAmount: -5 })).toEqual({
      minDiscountPercent: null,
      minAmount: null,
    })
    expect(parseApprovalThresholds({ minDiscountPercent: 150 })).toEqual({
      minDiscountPercent: null,
      minAmount: null,
    })
    expect(parseApprovalThresholds("bukan-objek")).toEqual({
      minDiscountPercent: null,
      minAmount: null,
    })
    expect(parseApprovalThresholds({ minDiscountPercent: "20", minAmount: "5000000" })).toEqual({
      minDiscountPercent: 20,
      minAmount: 5_000_000,
    })
  })

  it("banyak langkah: hanya langkah terpicu yang menandai gerbang", () => {
    const gate = evaluateQuotationApprovalGate(
      { subtotal: 75, discount: 25, grandTotal: 80 },
      [
        { stepOrder: 1, name: "Kepala Bengkel", conditions: { minDiscountPercent: 30 } },
        { stepOrder: 2, name: "Pemilik", conditions: { minDiscountPercent: 20 } },
        { stepOrder: 3, name: null, conditions: {} },
      ],
    )
    expect(gate.steps.map((s) => s.triggered)).toEqual([false, true, false])
    expect(gate.requiresApproval).toBe(true)
    expect(gate.hasConfiguredThresholds).toBe(true)
  })
})
