import { describe, it, expect } from "vitest"
import { computeQuotationLine, computeQuotationTotals } from "../quotation-totals"

// Kunci perilaku helper yang dipindah keluar file "use server" (PR #515):
// clamp qty/diskon anti-tamper + hitung ulang server-side tetap identik.
describe("computeQuotationLine/Totals (modul murni)", () => {
  it("diskon persen di-clamp 100 dan qty minimum 0.01", () => {
    expect(computeQuotationLine({ qty: 2, unitPrice: 1000, discount: 150, discountType: "percent" })).toEqual({
      discountAmount: 2000,
      total: 0,
    })
    expect(computeQuotationLine({ qty: 0, unitPrice: 1000, discount: 0 })).toEqual({
      discountAmount: 0,
      total: 10,
    })
  })

  it("total header: diskon di-clamp ke subtotal, pajak ditambah", () => {
    expect(
      computeQuotationTotals({
        sections: [
          {
            items: [
              { qty: 1, unitPrice: 1000, discount: 0 },
              { qty: 1, unitPrice: 500, discount: 100 },
            ],
          },
        ],
        discount: 99999,
        tax: 100,
      }),
    ).toEqual({ computedSubtotal: 1400, headerDiscount: 1400, headerTax: 100, computedGrandTotal: 100 })
  })
})
