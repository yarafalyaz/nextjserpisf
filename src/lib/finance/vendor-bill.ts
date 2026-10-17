import { safeAdd, safeMultiply, safeRound, safeSubtract } from "@/lib/utils/math"
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
  qty?: number
  unitPrice?: number
  discountPercent?: number
  taxPercent?: number
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

/** Nilai per baris tagihan, semua dibulatkan 2 desimal seperti tampilan uang. */
export function computeBillLineAmounts(line: VendorBillLineInput): VendorBillLineAmounts {
  const qty = safeRound(line.qty ?? 0, 2)
  const unitPrice = safeRound(line.unitPrice ?? 0, 2)
  const discountPercent = safeRound(line.discountPercent ?? 0, 2)
  const taxPercent = safeRound(line.taxPercent ?? 0, 2)
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

/**
 * Σ diskon baris dari JSON `items` form — persis jumlah `VendorBillItem.discountAmount`
 * yang akan ditulis `mapVendorBillItems` (baris ber-qty 0 diabaikan di kedua sisi),
 * sehingga diskon level dokumen tidak bisa berselisih dengan jumlah barisnya.
 */
export function sumBillItemDiscount(itemsJson: string | null | undefined): number {
  const rows = safeJsonParse<VendorBillLineInput[]>(itemsJson ?? null) ?? []
  return rows.reduce((sum, row) => {
    if (safeRound(row.qty ?? 0, 2) <= 0) return sum
    return safeAdd(sum, computeBillLineAmounts(row).discountAmount, 2)
  }, 0)
}
