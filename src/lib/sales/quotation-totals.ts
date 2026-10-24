import { safeAdd, safeSubtract, safeMultiply, safeDivide, safeRound } from "@/lib/utils/math"

/**
 * AUD-R10-03: recompute total quotation server-side (dedup create/update).
 * Jangan percaya subtotal/grandTotal kiriman klien — hitung ulang + clamp.
 * Murni (tanpa Prisma) supaya aksi lain (JobChangeOrder F-2026-10-22-066-S)
 * bisa hitung ulang tanpa impor file "use server".
 */
export function computeQuotationTotals(data: any): {
  computedSubtotal: number
  headerDiscount: number
  headerTax: number
  computedGrandTotal: number
} {
  const rawHeaderDiscount = Number(data.discount) || 0
  const headerTax = Math.max(0, Number(data.tax) || 0)
  const computedSubtotal = (data.sections || []).reduce(
    (acc: number, section: any) =>
      safeAdd(acc, (section.items || []).reduce((s: number, it: any) => safeAdd(s, computeQuotationLine(it).total, 0), 0), 0),
    0,
  )
  const headerDiscount = Math.min(Math.max(0, rawHeaderDiscount), computedSubtotal)
  const computedGrandTotal = Math.max(0, safeSubtract(safeAdd(computedSubtotal, headerTax, 0), headerDiscount, 0))
  return { computedSubtotal, headerDiscount, headerTax, computedGrandTotal }
}

/**
 * AUD-R10-03: computeLine quotation di module-scope (dedup create/update).
 * Murni: clamp qty/diskon anti-tamper, hitung via safe* decimal-safe.
 */
export function computeQuotationLine(item: any): { discountAmount: number; total: number } {
  const qty = Math.max(0.01, Number(item.qty) || 0)
  const unitPrice = Number(item.unitPrice) || 0
  const lineSubtotal = safeMultiply(qty, unitPrice, 0)
  let discountAmount = Number(item.discount) || 0
  if (item.discountType === "percent") {
    const percent = Math.min(100, Math.max(0, discountAmount))
    discountAmount = safeRound(safeDivide(safeMultiply(lineSubtotal, percent, 4), 100, 4), 0)
  }
  return { discountAmount, total: Math.max(0, safeSubtract(lineSubtotal, discountAmount, 0)) }
}
