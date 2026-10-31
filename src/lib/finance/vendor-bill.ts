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
  // Harga/qty negatif bukan fakta komersial: tanpa clamp, gross/subtotal/
  // total negatif lolos ke kop tagihan dan jurnal AP. Clamp di SATU sumber
  // hitung ini (pola persen di bawah), bukan menolak.
  const qty = Math.max(0, safeRound(parseLocaleNumber(line.qty) ?? 0, 2))
  const unitPrice = Math.max(0, safeRound(parseMoneyAmount(line.unitPrice) ?? 0, 2))
  // R8-JB-07: persen di luar [0,100] menghasilkan subtotal/total negatif
  // yang lolos ke kop + jurnal AP (bill tanpa PO/kop manual). Clamp di
  // SATU sumber hitung ini (pola tax-invoice.ts creditablePercent),
  // bukan menolak: form lama yang menyimpan persen wajar tak berubah.
  const discountPercent = Math.min(100, Math.max(0, safeRound(parseLocaleNumber(line.discountPercent) ?? 0, 2)))
  const taxPercent = Math.min(100, Math.max(0, safeRound(parseLocaleNumber(line.taxPercent) ?? 0, 2)))
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
 * R8-JB-08: nilai kupasan kop MANUAL (bill tanpa baris): `subtotal` =
 * DPP bruto tanpa diskon dokumen (diskon by-design 0, ia hanya ada di
 * baris), jadi identitas sahnya `grandTotal = subtotal + tax`.
 * `expectedGrandTotal` = angka yang konsisten; caller menolak bila
 * selisih dari `grandTotal` melebihi toleransi 2 sen (pembulatan tampilan uang).
 */
export function manualBillHeader(
  kop: { subtotal: number; tax: number; grandTotal: number },
): VendorBillHeaderTotals & { expectedGrandTotal: number } {
  return {
    subtotal: kop.subtotal,
    discountAmount: 0,
    tax: kop.tax,
    grandTotal: kop.grandTotal,
    expectedGrandTotal: safeAdd(kop.subtotal, kop.tax, 2),
  }
}

/**
 * PPh dipotong wajib punya jenis (akun kewajiban diturunkan darinya) dan
 * tidak boleh melebihi grand total: dipakai create/update atas
 * billHeader.grandTotal terhitung server, dan confirm atas nilai tersimpan
 * (draft lama bisa lolos sebelum guard ini ada). Mengembalikan pesan error
 * definitif atau null.
 */
export function withholdingGuard(
  amount: number,
  typeId: number | null | undefined,
  grandTotal: number,
): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return null
  if (typeId == null) {
    return "Nilai PPh dipotong wajib memilih jenis PPh — tanpa jenis, akun Hutang PPh tidak dapat ditentukan."
  }
  if (amount > grandTotal) {
    return `Pemotongan PPh (${amount}) melebihi total keseluruhan tagihan (${grandTotal}) — periksa data tagihan vendor.`
  }
  return null
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

const DAY_MS = 86_400_000

/**
 * R8-JB-09 — jatuh tempo dokumen dari termin master (`PaymentTerm.days`).
 *
 * ERP menyimpan `dueDate` sebagai SNAPSHOT pada dokumen: tanggal dokumen +
 * hari termin lawan saat dokumen lahir/diubah. Perubahan termin master
 * sesudahnya tidak menggeser dokumen lama, sama seperti harga master tidak
 * menulis ulang baris dokumen. Tanggal dokumen tersimpan tengah malam UTC
 * (`wibDateToUtcMidnight`), jadi penambahan hari kalender murni UTC.
 * Termin negatif/tak berhingga bukan termin sah: abaikan (null), jangan
 * pernah menghasilkan jatuh tempo sebelum tanggal dokumen dari data korup.
 */
export function computeDueDate(documentDate: Date, termDays: number | null | undefined): Date | null {
  if (termDays == null || !Number.isFinite(termDays) || termDays < 0) return null
  return new Date(documentDate.getTime() + Math.trunc(termDays) * DAY_MS)
}

/**
 * Pilihan jatuh tempo efektif: nilai eksplisit dari form selalu menang
 * (override manual adalah fakta komersial dokumen itu), kosong baru
 * diturunkan dari termin lawan. Keduanya kosong → null (tanpa termin,
 * aging memperlakukan dokumen sebagai jatuh tempo pada tanggalnya).
 */
export function resolveDueDate(input: {
  explicit: Date | null
  documentDate: Date
  termDays: number | null | undefined
}): Date | null {
  return input.explicit ?? computeDueDate(input.documentDate, input.termDays)
}
