import { describe, it, expect } from "vitest"
import { computeBillLineAmounts, sumBillItemDiscount } from "@/lib/finance/vendor-bill"

describe("matematika baris tagihan vendor", () => {
  it("menghitung kotor, diskon, subtotal, pajak, dan total", () => {
    const a = computeBillLineAmounts({ qty: 3, unitPrice: 100_000, discountPercent: 10, taxPercent: 11 })
    expect(a.gross).toBe(300_000)
    expect(a.discountAmount).toBe(30_000)
    expect(a.subtotal).toBe(270_000)
    expect(a.taxAmount).toBe(29_700)
    expect(a.total).toBe(299_700)
  })

  it("membulatkan diskon ke 2 desimal", () => {
    const a = computeBillLineAmounts({ qty: 1, unitPrice: 33_333.33, discountPercent: 7.5 })
    expect(a.gross).toBe(33_333.33)
    expect(a.discountAmount).toBe(2_500)
    expect(a.subtotal).toBe(30_833.33)
  })

  it("mengabaikan nilai kosong tanpa menghasilkan NaN", () => {
    const a = computeBillLineAmounts({})
    expect(a.gross).toBe(0)
    expect(a.discountAmount).toBe(0)
    expect(a.total).toBe(0)
  })
})

describe("Σ diskon baris untuk diskon level dokumen", () => {
  it("menjumlahkan diskon seluruh baris dari JSON form", () => {
    const json = JSON.stringify([
      { itemId: 1, qty: 3, unitPrice: 100_000, discountPercent: 10 },
      { itemId: 2, qty: 2, unitPrice: 50_000, discountPercent: 50 },
    ])
    // 30.000 + 50.000
    expect(sumBillItemDiscount(json)).toBe(80_000)
  })

  it("mengabaikan baris ber-qty 0 — sama seperti saat menulis barisnya", () => {
    const json = JSON.stringify([
      { itemId: 1, qty: 1, unitPrice: 100_000, discountPercent: 10 },
      { itemId: 2, qty: 0, unitPrice: 999_999, discountPercent: 90 },
    ])
    expect(sumBillItemDiscount(json)).toBe(10_000)
  })

  it("aman untuk JSON kosong/null dan isi tak terduga", () => {
    expect(sumBillItemDiscount(null)).toBe(0)
    expect(sumBillItemDiscount(undefined)).toBe(0)
    expect(sumBillItemDiscount("[]")).toBe(0)
    expect(sumBillItemDiscount("bukan json")).toBe(0)
  })

  it("total diskon dokumen sama dengan jumlah diskon per baris (tidak boleh berselisih)", () => {
    const rows = [
      { itemId: 1, qty: 4, unitPrice: 12_345.67, discountPercent: 7.5 },
      { itemId: 2, qty: 1, unitPrice: 999.99, discountPercent: 33.33 },
      { itemId: 3, qty: 2, unitPrice: 1_000, discountPercent: 0 },
    ]
    const perLine = rows.reduce((s, r) => s + computeBillLineAmounts(r).discountAmount, 0)
    expect(sumBillItemDiscount(JSON.stringify(rows))).toBeCloseTo(perLine, 2)
  })
})
