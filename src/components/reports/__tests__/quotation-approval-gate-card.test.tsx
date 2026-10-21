// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { QuotationApprovalGateCard } from "../quotation-approval-gate-card"
import { evaluateQuotationApprovalGate } from "@/lib/reports/quotation-approval-gate"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

describe("QuotationApprovalGateCard F-2026-10-20-100", () => {
  it("tanpa ambang terkonfigurasi: tidak tampil sama sekali", () => {
    const gate = evaluateQuotationApprovalGate(
      { subtotal: 80_000_000, discount: 20_000_000, grandTotal: 85_000_000 },
      [{ stepOrder: 1, name: "Supervisor", conditions: null }],
    )
    const { container, root } = renderCard(<QuotationApprovalGateCard gate={gate} />)
    expect(container.querySelector('[aria-label="Ambang Persetujuan Penawaran"]')).toBeNull()
    expect(container.textContent ?? "").not.toContain("Ambang Persetujuan")
    unmountCard(root)
  })

  it("langkah terpicu: tampil nama langkah, ambang, dan status Terpicu", () => {
    const gate = evaluateQuotationApprovalGate(
      { subtotal: 75_000_000, discount: 25_000_000, grandTotal: 110_000_000 },
      [
        {
          stepOrder: 1,
          name: "Pemilik",
          conditions: { minDiscountPercent: 20, minAmount: 100_000_000 },
        },
        { stepOrder: 2, name: null, conditions: {} },
      ],
    )
    const { container, root } = renderCard(<QuotationApprovalGateCard gate={gate} />)
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Ambang Persetujuan Penawaran"]')).not.toBeNull()
    expect(text).toContain("Pemilik")
    expect(text).toContain("Terpicu")
    expect(text).toContain("Memenuhi ambang persetujuan")
    expect(text).toContain("hanya informasi")
    // langkah tanpa ambang tidak dievaluasi -> tidak tampil
    expect(text).not.toContain("Langkah 2")
    unmountCard(root)
  })

  it("ambang ada tetapi tidak terpicu: tampil Tidak terpicu, bukan penahan", () => {
    const gate = evaluateQuotationApprovalGate(
      { subtotal: 75_000_000, discount: 25_000_000, grandTotal: 80_000_000 },
      [
        {
          stepOrder: 1,
          name: "Kepala Bengkel",
          conditions: { minDiscountPercent: 20, minAmount: 100_000_000 },
        },
      ],
    )
    const { container, root } = renderCard(<QuotationApprovalGateCard gate={gate} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Kepala Bengkel")
    expect(text).toContain("Tidak terpicu")
    expect(text).toContain("Tidak memenuhi ambang")
    unmountCard(root)
  })
})
