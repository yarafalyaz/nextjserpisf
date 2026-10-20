import { describe, it, expect, vi } from "vitest"
import {
  pickPriceListPrice,
  resolveLinePricing,
  loadPriceListRows,
  priceDocumentLines,
  type PriceListRow,
} from "@/lib/services/customer-price-list.service"

// F-PRICELIST-01 tahap 1 — syarat tes vonis akuntansi:
// (a) invoice dari price-list menghasilkan jurnal ANGKA IDENTIK dengan
//     invoice manual berharga sama -> dibuktikan di lapis dokumen: baris
//     ter-resolve identik, sehingga subtotal/taxAmount/totalAmount yang
//     dibaca hook jurnal identik (posting-journal-equivalence.test.ts);
// (b) prioritas manual-menang atas price-list;
// (c) diskon diterapkan SEBELUM pajak (DPP turun).

const row = (over: Partial<PriceListRow>): PriceListRow => ({
  customerCategoryId: null,
  itemId: 1,
  price: 90000,
  effectiveDate: null,
  isActive: true,
  ...over,
})

describe("pickPriceListPrice", () => {
  const date = new Date("2026-10-20T00:00:00Z")

  it("memilih baris kategori spesifik di atas baris umum per item", () => {
    const rows = [row({ price: 90000 }), row({ customerCategoryId: 7, price: 80000 })]
    expect(pickPriceListPrice(rows, { itemId: 1, customerCategoryId: 7, date })).toBe(80000)
    expect(pickPriceListPrice(rows, { itemId: 1, customerCategoryId: 9, date })).toBe(90000)
    expect(pickPriceListPrice(rows, { itemId: 1, customerCategoryId: null, date })).toBe(90000)
  })

  it("mengabaikan baris belum efektif, nonaktif, dan item lain", () => {
    const rows = [
      row({ price: 1, effectiveDate: new Date("2026-11-01T00:00:00Z") }),
      row({ price: 2, isActive: false }),
      row({ price: 3, itemId: 2 }),
    ]
    expect(pickPriceListPrice(rows, { itemId: 1, customerCategoryId: null, date })).toBeNull()
  })

  it("di antara kandidat setara, tanggal efektif terbaru menang", () => {
    const rows = [
      row({ price: 95000, effectiveDate: new Date("2026-01-01T00:00:00Z") }),
      row({ price: 90000, effectiveDate: new Date("2026-06-01T00:00:00Z") }),
    ]
    expect(pickPriceListPrice(rows, { itemId: 1, customerCategoryId: null, date })).toBe(90000)
  })
})

describe("resolveLinePricing (prioritas + diskon sebelum pajak)", () => {
  it("price-list menjadi unitPrice, menggantikan Item.price", () => {
    const r = resolveLinePricing({ qty: 2, itemPrice: 100000, priceListPrice: 90000 })
    expect(r).toMatchObject({ unitPrice: 90000, discount: 0, total: 180000, fromPriceList: true })
  })

  it("tanpa price-list memakai Item.price (default aman)", () => {
    const r = resolveLinePricing({ qty: 2, itemPrice: 100000, priceListPrice: null })
    expect(r).toMatchObject({ unitPrice: 100000, total: 200000, fromPriceList: false })
  })

  it("diskon manual menimpa di atas harga price-list (manual menang)", () => {
    const r = resolveLinePricing({ qty: 1, itemPrice: 100000, priceListPrice: 90000, manualDiscount: 15000 })
    expect(r).toMatchObject({ unitPrice: 90000, discount: 15000, total: 75000, fromPriceList: true })
  })

  it("diskon efektif dibatasi 100% nilai baris (total tidak negatif)", () => {
    const r = resolveLinePricing({ qty: 1, itemPrice: 100000, priceListPrice: 90000, manualDiscount: 999999 })
    expect(r.discount).toBe(90000)
    expect(r.total).toBe(0)
  })

  it("diskon SEBELUM pajak: DPP = subtotal - diskon, bukan subtotal penuh", () => {
    // PPN 11% hanya atas DPP ter-diskon: 90000-15000=75000 -> pajak 8250.
    // Bila diskon sesudah pajak, DPP=90000 -> pajak 9900 (yang DILARANG).
    const r = resolveLinePricing({ qty: 1, itemPrice: 100000, priceListPrice: 90000, manualDiscount: 15000 })
    const dpp = r.total
    const tax = Math.round((dpp * 11) / 100)
    expect(dpp).toBe(75000)
    expect(tax).toBe(8250)
    expect(tax).not.toBe(9900)
  })

  it("peringatan lunak margin: total di bawah HPP ditandai, tidak diblokir", () => {
    const r = resolveLinePricing({ qty: 2, itemPrice: 100000, itemCost: 95000, priceListPrice: 90000 })
    expect(r.total).toBe(180000)
    expect(r.belowCost).toBe(true)
    const ok = resolveLinePricing({ qty: 2, itemPrice: 100000, itemCost: 80000, priceListPrice: 90000 })
    expect(ok.belowCost).toBe(false)
  })
})

describe("loadPriceListRows", () => {
  it("memuat baris umum + kategori pelanggan, harga dinormalkan number", async () => {
    const findUnique = vi.fn().mockResolvedValue({ customerCategoryId: 7 })
    const findMany = vi.fn().mockResolvedValue([
      { customerCategoryId: null, itemId: 1, price: "90000", effectiveDate: null, isActive: true },
      { customerCategoryId: 7, itemId: 1, price: "80000", effectiveDate: null, isActive: true },
    ])
    const out = await loadPriceListRows(
      { customer: { findUnique }, customerPriceList: { findMany } } as never,
      { customerId: 3, itemIds: [1, 1, 2], date: new Date("2026-10-20T00:00:00Z") },
    )
    expect(out.customerCategoryId).toBe(7)
    expect(out.rows.map((r) => r.price)).toEqual([90000, 80000])
    const where = findMany.mock.calls[0][0].where
    expect(where.itemId.in).toEqual([1, 2])
  })

  it("tanpa item valid tidak menyentuh DB", async () => {
    const findUnique = vi.fn()
    const findMany = vi.fn()
    const out = await loadPriceListRows(
      { customer: { findUnique }, customerPriceList: { findMany } } as never,
      { customerId: 3, itemIds: [], date: new Date() },
    )
    expect(out.rows).toEqual([])
    expect(findUnique).not.toHaveBeenCalled()
  })
})

describe("priceDocumentLines", () => {
  it("menerapkan price-list per baris; baris tanpa item dibiarkan manual", () => {
    const lines = priceDocumentLines(
      [
        { itemId: 1, qty: 2, discount: 0 },
        { itemId: null, qty: 1, discount: 5000 },
      ],
      {
        rows: [row({ price: 90000 })],
        customerCategoryId: null,
        date: new Date("2026-10-20T00:00:00Z"),
        itemById: new Map([[1, { price: 100000, cost: 80000 }]]),
      },
    )
    expect(lines[0]).toMatchObject({ unitPrice: 90000, total: 180000, fromPriceList: true })
    expect(lines[1]).toMatchObject({ unitPrice: 0, total: 0, fromPriceList: false })
  })
})
