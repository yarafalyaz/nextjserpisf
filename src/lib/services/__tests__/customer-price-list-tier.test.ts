import { describe, it, expect } from "vitest"
import {
  pickPriceListPrice,
  pickPriceListRow,
  resolveLinePricing,
  priceDocumentLines,
  type PriceListRow,
} from "@/lib/services/customer-price-list.service"

// F-2026-10-21-018 (spec PR #385): tabel contoh A1-A18 wajib.
// Master: item 1, Item.price 100000, Item.cost 80000 (A18: 90000),
// tanggal dokumen 2026-10-22, semua baris aktif effectiveDate null.
const date = new Date("2026-10-22T00:00:00Z")

const tier = (minQty: number, price: number, over: Partial<PriceListRow> = {}): PriceListRow => ({
  customerCategoryId: null,
  itemId: 1,
  price,
  minQty,
  effectiveDate: null,
  isActive: true,
  ...over,
})

const master: PriceListRow[] = [tier(1, 100000), tier(5, 95000), tier(10, 88000), tier(20, 85000), tier(100, 83000)]

const pick = (qty: number, rows: PriceListRow[] = master, customerCategoryId: number | null = null) =>
  pickPriceListPrice(rows, { itemId: 1, customerCategoryId, date, qty })

describe("F-018 tingkat qty-aware (A1-A15)", () => {
  it("A1 qty 1 -> T1 100000", () => expect(pick(1)).toBe(100000))
  it("A2 qty 4,99 -> T1 (di bawah tingkat 5, tanpa pembulatan)", () => expect(pick(4.99)).toBe(100000))
  it("A3 qty tepat 5 INKLUSIF -> T5 95000", () => expect(pick(5)).toBe(95000))
  it("A4 qty 9,99 -> T5, total 949050 PPN 104396 grand 1053446", () => {
    const r = resolveLinePricing({ qty: 9.99, itemPrice: 100000, priceListPrice: pick(9.99) })
    expect(r.unitPrice).toBe(95000)
    expect(r.total).toBe(949050)
    const tax = Math.round((r.total * 11) / 100)
    expect(tax).toBe(104396)
    expect(r.total + tax).toBe(1053446)
  })
  it("A5 qty tepat 10 -> T10 88000", () => expect(pick(10)).toBe(88000))
  it("A6 qty 15 -> T10", () => expect(pick(15)).toBe(88000))
  it("A7 qty 20 -> T20 85000", () => expect(pick(20)).toBe(85000))
  it("A8 qty 150 -> T100 83000", () => expect(pick(150)).toBe(83000))
  it("A9 diskon manual di atas tingkat: DPP 830000, PPN 91300", () => {
    const r = resolveLinePricing({ qty: 10, itemPrice: 100000, priceListPrice: pick(10), manualDiscount: 50000 })
    expect(r.unitPrice).toBe(88000)
    expect(r.total).toBe(830000)
    expect(Math.round((r.total * 11) / 100)).toBe(91300)
  })
  it("A10 diskon cap 100% -> total 0", () => {
    const r = resolveLinePricing({ qty: 10, itemPrice: 100000, priceListPrice: pick(10), manualDiscount: 999999999 })
    expect(r.total).toBe(0)
  })
  it("A11 kategori spesifik menang walau minQty lebih kecil + lebih mahal", () => {
    const rows = [...master, tier(1, 90000, { customerCategoryId: 7 })]
    expect(pick(10, rows, 7)).toBe(90000)
  })
  it("A12 kategori spesifik + tingkatnya sendiri menang atas umum", () => {
    const rows = [...master, tier(10, 87000, { customerCategoryId: 7 })]
    expect(pick(10, rows, 7)).toBe(87000)
  })
  it("A13 baris kategori lain tidak bocor", () => {
    const rows = [...master, tier(10, 87000, { customerCategoryId: 7 })]
    expect(pick(10, rows, 9)).toBe(88000)
  })
  it("A14 dua baris 6+6 TIDAK digabung (masing-masing T5)", () => {
    const lines = priceDocumentLines(
      [
        { itemId: 1, qty: 6, discount: 0 },
        { itemId: 1, qty: 6, discount: 0 },
      ],
      { rows: master, customerCategoryId: null, date, itemById: new Map([[1, { price: 100000, cost: 80000 }]]) },
    )
    expect(lines.map((l) => l.unitPrice)).toEqual([95000, 95000])
    expect(lines[0].priceSource).toBe("price_list_tier")
    expect(lines[0].priceListMinQty).toBe(5)
  })
  it("A15 baris belum efektif dilewati -> tingkat di bawahnya", () => {
    const rows = master.map((r) => (r.minQty === 10 ? { ...r, effectiveDate: new Date("2026-11-01T00:00:00Z") } : r))
    expect(pick(10, rows)).toBe(95000)
  })
})

describe("F-018 sumber harga + data rusak (BR-TIER-09/14, A18)", () => {
  it("pemenang tingkat: priceSource=price_list_tier + minQty tercatat", () => {
    const winner = pickPriceListRow(master, { itemId: 1, customerCategoryId: null, date, qty: 10 })
    const r = resolveLinePricing({ qty: 10, itemPrice: 100000, priceListPrice: winner?.price ?? null, priceListRow: winner })
    expect(r.priceSource).toBe("price_list_tier")
    expect(r.priceListMinQty).toBe(10)
  })
  it("pemenang dasar minQty 1: priceSource=price_list_base", () => {
    const winner = pickPriceListRow(master, { itemId: 1, customerCategoryId: null, date, qty: 2 })
    const r = resolveLinePricing({ qty: 2, itemPrice: 100000, priceListPrice: winner?.price ?? null, priceListRow: winner })
    expect(r.priceSource).toBe("price_list_base")
    expect(r.priceListMinQty).toBe(1)
  })
  it("tanpa baris berlaku: item_master + metadata null", () => {
    const r = resolveLinePricing({ qty: 2, itemPrice: 100000, priceListPrice: null })
    expect(r.priceSource).toBe("item_master")
    expect(r.priceListId).toBeNull()
    expect(r.priceListMinQty).toBeNull()
  })
  it("A18 di bawah HPP: belowCost=true, tidak diblokir", () => {
    const r = resolveLinePricing({ qty: 10, itemPrice: 100000, itemCost: 90000, priceListPrice: pick(10) })
    expect(r.unitPrice).toBe(88000)
    expect(r.belowCost).toBe(true)
  })
  it("minQty <= 0 data rusak: dilewati walau satu-satunya baris (bukan clamp)", () => {
    expect(pick(10, [tier(0, 50000)])).toBeNull()
    expect(pick(10, [tier(-3, 50000)])).toBeNull()
  })
  it("minQty null/undefined terbaca sebagai 1 (baris pra-migrasi)", () => {
    const legacy: PriceListRow = { customerCategoryId: null, itemId: 1, price: 90000, effectiveDate: null, isActive: true }
    expect(pickPriceListPrice([legacy], { itemId: 1, customerCategoryId: null, date, qty: 1 })).toBe(90000)
  })
  it("tingkat lebih mahal tetap dipilih (BR-TIER-12: tanpa monoton wajib)", () => {
    const rows = [tier(1, 100000), tier(10, 110000)]
    expect(pick(10, rows)).toBe(110000)
  })
})
