import { describe, it, expect } from "vitest"
import { resolveLinePricing, type PriceListRow } from "@/lib/services/customer-price-list.service"
import { pickPriceListPrice } from "@/lib/services/customer-price-list.service"

// F-PRICELIST-01: ekuivalensi angka jurnal. Hook posting
// (accounting.hook onSalesInvoicePosted) MEMBACA dari dokumen tersimpan:
//   jurnal.totalDebit = jurnal.totalCredit = inv.totalAmount (:326-327)
//   pendapatan neto = inv.totalAmount - inv.taxAmount (:337)
// Jadi dua invoice dengan (totalAmount, taxAmount) sama menghasilkan jurnal
// identik — dibuktikan di sini pada level angka dokumen, dan angka jurnal
// turunannya ditegaskan identik. Jalur price-list mencapai angka dokumen
// yang sama lewat resolveLinePricing (unitPrice dari price-list), jalur
// manual lewat harga ketik + diskon existing. Rumus header meniru
// createSalesInvoice (sales.actions.ts:1143-1153): pajak atas
// (subtotal - diskon header), grand = subtotal + pajak - diskon.

function headerTotals(lines: { total: number }[], headerDiscount: number, taxRate: number) {
  const subtotal = lines.reduce((s, l) => s + l.total, 0)
  const discountTotal = Math.min(Math.max(0, headerDiscount), subtotal)
  const taxAmount = Math.round(((subtotal - discountTotal) * taxRate) / 100)
  const grandTotal = subtotal + taxAmount - discountTotal
  return { subtotal, discountTotal, taxAmount, grandTotal, totalAmount: grandTotal }
}

/** Angka jurnal turunan persis seperti accounting.hook:326-337. */
function journalFigures(doc: { totalAmount: number; taxAmount: number }) {
  const taxAmount = doc.taxAmount
  return {
    totalDebit: doc.totalAmount,
    totalCredit: doc.totalAmount,
    revenueCredit: doc.totalAmount - taxAmount,
    ppnCredit: taxAmount,
  }
}

const priceListRows: PriceListRow[] = [
  { customerCategoryId: 7, itemId: 1, price: 90000, effectiveDate: null, isActive: true },
]

describe("ekuivalensi jurnal price-list vs manual", () => {
  it("harga price-list (kategori) menghasilkan angka dokumen+jurnal IDENTIK dengan manual berharga sama", () => {
    const date = new Date("2026-10-20T00:00:00Z")
    const listPrice = pickPriceListPrice(priceListRows, { itemId: 1, customerCategoryId: 7, date })
    expect(listPrice).toBe(90000)

    // Jalur price-list: Item.price 100000 ditimpa price-list 90000.
    const viaList = resolveLinePricing({ qty: 3, itemPrice: 100000, priceListPrice: listPrice, manualDiscount: 0 })
    // Jalur manual: kasir mengetik 90000 langsung (tanpa price-list).
    const viaManual = resolveLinePricing({ qty: 3, itemPrice: 90000, priceListPrice: null, manualDiscount: 0 })
    expect(viaList).toMatchObject({ unitPrice: 90000, total: 270000 })
    expect(viaManual.total).toBe(viaList.total)

    const docList = headerTotals([viaList], 0, 11)
    const docManual = headerTotals([viaManual], 0, 11)
    expect(docList).toEqual(docManual)
    expect(journalFigures(docList)).toEqual(journalFigures(docManual))
    expect(journalFigures(docList)).toEqual({
      totalDebit: 299700,
      totalCredit: 299700,
      revenueCredit: 270000,
      ppnCredit: 29700,
    })
  })

  it("diskon manual di atas price-list tetap SEBELUM pajak dan identik dengan manual setara", () => {
    const viaList = resolveLinePricing({ qty: 2, itemPrice: 100000, priceListPrice: 90000, manualDiscount: 10000 })
    const viaManual = resolveLinePricing({ qty: 2, itemPrice: 90000, priceListPrice: null, manualDiscount: 10000 })
    expect(viaList.total).toBe(170000)
    expect(viaList.total).toBe(viaManual.total)

    const doc = headerTotals([viaList], 0, 11)
    // DPP = 170000 (sesudah diskon), PPN = 18700 — bukan 19800 (DPP 180000).
    expect(doc.taxAmount).toBe(18700)
    expect(doc.taxAmount).not.toBe(19800)
    expect(journalFigures(doc)).toEqual({
      totalDebit: 188700,
      totalCredit: 188700,
      revenueCredit: 170000,
      ppnCredit: 18700,
    })
  })

  it("tanpa baris price-list berlaku, harga Item.price dipakai persis (default aman sebelum fitur aktif)", () => {
    const date = new Date("2026-10-20T00:00:00Z")
    const none = pickPriceListPrice(priceListRows, { itemId: 1, customerCategoryId: 99, date })
    expect(none).toBeNull()
    const line = resolveLinePricing({ qty: 1, itemPrice: 100000, priceListPrice: none })
    expect(line).toMatchObject({ unitPrice: 100000, total: 100000, fromPriceList: false })
  })
})
