import { safeAdd, safeMultiply, safeRound, safeSubtract } from "@/lib/utils/math"
import { parseLocaleNumber, parseMoneyAmount } from "@/lib/utils/parse-money"
import { safeJsonParse } from "@/lib/utils/safe-parse"

/**
 * Matematika baris tagihan vendor (diskon & pajak) — SATU sumber untuk perhitungan
 * baris DAN untuk total diskon di level dokumen.
 *
 * Mengapa dipisah: `VendorBill.subtotal` yang dikirim form adalah angka BRUTO
 * (Σ qty × harga, SEBELUM diskon baris), sementara diskon barisnya disimpan di
 * `VendorBillItem.discountAmount`. Laporan menghitung DPP sebagai
 * `subtotal − discountAmount` (laporan/pajak, laporan/bukti-potong-pph,
 * lib/reports/vat-invoices-data, dan cetak dokumen) — jadi kolom diskon level
 * DOKUMEN wajib ikut diisi dengan Σ diskon baris, kalau tidak DPP yang dilaporkan
 * lebih besar daripada dasar pemotongan yang sebenarnya.
 */

export type VendorBillLineInput = {
  itemId?: number | string | null
  qty?: number | string
  unitPrice?: number | string
  discountPercent?: number | string
  taxPercent?: number | string
}

export type VendorBillLineAmounts = {
  qty: number
  unitPrice: number
  discountPercent: number
  taxPercent: number
  gross: number
  discountAmount: number
  subtotal: number
  taxAmount: number
  total: number
}

/**
 * Nilai per baris tagihan, semua dibulatkan 2 desimal seperti tampilan uang.
 *
 * Field di dalam JSON `items` Server Action bisa berbentuk string format
 * id-ID ("2.000.000", "2.000.000,50"): wajib lewat parser repo lebih dulu —
 * `Number("2.000.000")` = 2 dan `Number("2.000")` = 2 merusak `qty`,
 * `unitPrice`, persen diskon/pajak diam-diam (kelas bug PR #464/#466).
 * String tak terbaca → 0 (perilaku lama `?? 0` untuk input tak sah).
 */
export function computeBillLineAmounts(line: VendorBillLineInput): VendorBillLineAmounts {
  const qty = safeRound(parseLocaleNumber(line.qty) ?? 0, 2)
  const unitPrice = safeRound(parseMoneyAmount(line.unitPrice) ?? 0, 2)
  const discountPercent = safeRound(parseLocaleNumber(line.discountPercent) ?? 0, 2)
  const taxPercent = safeRound(parseLocaleNumber(line.taxPercent) ?? 0, 2)
  const gross = safeMultiply(qty, unitPrice, 2)
  const discountAmount = safeMultiply(gross, discountPercent / 100, 2)
  const subtotal = safeSubtract(gross, discountAmount, 2)
  const taxAmount = safeMultiply(subtotal, taxPercent / 100, 2)
  return {
    qty,
    unitPrice,
    discountPercent,
    taxPercent,
    gross,
    discountAmount,
    subtotal,
    taxAmount,
    total: safeAdd(subtotal, taxAmount, 2),
  }
}

export type VendorBillHeaderTotals = {
  /** Bruto: Σ (qty × harga) sebelum diskon baris. */
  subtotal: number
  discountAmount: number
  tax: number
  grandTotal: number
}

/**
 * Totales kop tagihan dihitung ulang dari baris `items` — SATU sumber angka.
 * Mengembalikan `null` bila tidak ada baris berlaku (qty > 0): tagihan tanpa
 * rincian baris (jasa/manual) tetap memakai kop yang dikirim form.
 * `subtotal` kop adalah BRUTO, konsisten dengan pembaca DPP
 * (`subtotal − discountAmount`) dan penjaga 3-way match.
 */
export function summarizeBillItems(
  itemsJson: string | null | undefined,
): VendorBillHeaderTotals | null {
  const rows = safeJsonParse<VendorBillLineInput[]>(itemsJson ?? null) ?? []
  const lines = rows
    .filter((row) => safeRound(parseLocaleNumber(row.qty) ?? 0, 2) > 0)
    .map((row) => computeBillLineAmounts(row))
  if (lines.length === 0) return null
  const subtotal = lines.reduce((sum, line) => safeAdd(sum, line.gross, 2), 0)
  const discountAmount = lines.reduce((sum, line) => safeAdd(sum, line.discountAmount, 2), 0)
  const tax = lines.reduce((sum, line) => safeAdd(sum, line.taxAmount, 2), 0)
  const grandTotal = lines.reduce((sum, line) => safeAdd(sum, line.total, 2), 0)
  return { subtotal, discountAmount, tax, grandTotal }
}

/**
 * Σ diskon baris dari JSON `items` form — persis jumlah `VendorBillItem.discountAmount`
 * yang akan ditulis `mapVendorBillItems` (baris ber-qty 0 diabaikan di kedua sisi),
 * sehingga diskon level dokumen tidak bisa berselisih dengan jumlah barisnya.
 */
export function sumBillItemDiscount(itemsJson: string | null | undefined): number {
  const rows = safeJsonParse<VendorBillLineInput[]>(itemsJson ?? null) ?? []
  return rows.reduce((sum, row) => {
    if (safeRound(parseLocaleNumber(row.qty) ?? 0, 2) <= 0) return sum
    return safeAdd(sum, computeBillLineAmounts(row).discountAmount, 2)
  }, 0)
}

/**
 * F-2026-10-28-157-V Putusan 3 — format referensi termin.
 *
 * Bill ber-PO WAJIB `terms` = `TERMIN n/m — <acuan>` (n ≤ m, n,m ≥ 1);
 * bill TANPA `terms` = termin tunggal, LULUS tanpa warning; bill tanpa PO =
 * teks bebas (Putusan 3 hanya mengikat bill ber-PO).
 */
export const VENDOR_BILL_TERMS_REF_PATTERN = /^TERMIN\s+(\d+)\s*\/\s*(\d+)\s+[—–-]\s*\S/

export function isValidTermsReference(terms: string | null | undefined): boolean {
  const t = (terms ?? "").trim()
  if (t === "") return true
  const m = VENDOR_BILL_TERMS_REF_PATTERN.exec(t)
  if (!m) return false
  const n = Number(m[1])
  const total = Number(m[2])
  return n >= 1 && total >= 1 && n <= total
}

export const VENDOR_BILL_TERMS_REF_ERROR =
  "Termin bill ber-PO wajib format referensi TERMIN n/m — <acuan> (contoh: TERMIN 1/3 — DP 30% PO-2026-001). Kosongkan bila termin tunggal."
