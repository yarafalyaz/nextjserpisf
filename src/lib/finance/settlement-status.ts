import { safeSubtract, type SafeMathInput } from "@/lib/utils/math"

/**
 * FIN-BR-006 — status lunas mengikuti outstanding valid + toleransi
 * pembulatan yang disetujui. Satu sumber untuk sisi jual (SalesInvoice)
 * dan sisi beli (VendorBill).
 *
 * Toleransi disetujui: Rp1,00 (satu rupiah penuh).
 * Alasan: semua kolom uang `Decimal(15,2)` dan semua hitung lewat
 * `safeRound(..., 2)` sen — selisih aritmetika murni sesudah pembulatan
 * sen selalu 0. Sisa 0,01–1,00 bukan drift hitung, melainkan pembulatan
 * pembayaran riil (kas/bank dibayar rupiah penuh, tanpa sen). Tanpa
 * toleransi ini faktur Rp999.999,50 yang dibayar Rp1.000.000 penuh tidak
 * pernah lunas dan aging AR/AP menggembung selamanya. Batas Rp1 dipilih
 * karena: (a) cukup menutup satu langkah pembulatan rupiah-penuh,
 * (b) terlalu kecil untuk menyembunyikan kekurangan bayar material —
 * sisa > Rp1 tetap `partial`/`posted` dan tertampil di aging.
 * Nilai ini BUKAN fallback akun dan BUKAN penyesuaian jurnal: sisa dalam
 * toleransi tidak dibukukan ke mana-mana, hanya status dokumen yang
 * dinyatakan lunas; paidAmount tetap angka pembayaran sebenarnya.
 */
export const SETTLEMENT_TOLERANCE_IDR = 1

/**
 * Sisa outstanding dianggap lunas bila <= toleransi FIN-BR-006.
 *
 * Untuk laporan/antrean yang hanya memegang angka SISA (bukan pasangan
 * grandTotal − totalPaid). Sebelum paritas ini tiap modul laporan menyimpan
 * ambangnya sendiri (0,005), sehingga satu faktur dengan sisa Rp0,50 tampil
 * "Lunas" di layar faktur/daftar tukar faktur tetapi tetap dihitung sebagai
 * piutang di antrean penagihan, statement pelanggan, dan antrean tukar faktur
 * lewat batas — dua kebenaran untuk satu dokumen.
 */
export function isOutstandingSettled(outstanding: SafeMathInput): boolean {
  return Number(outstanding ?? 0) <= SETTLEMENT_TOLERANCE_IDR
}

/** Outstanding valid = grandTotal − total terbayar valid, presisi sen. */
export function settlementOutstanding(
  grandTotal: SafeMathInput,
  totalPaid: SafeMathInput,
): number {
  return safeSubtract(grandTotal, totalPaid, 2)
}

/**
 * Lunas bila outstanding <= toleransi. `grandTotal <= 0` tidak pernah
 * lunas lewat jalur ini (dokumen nol/batal bukan piutang/hutang).
 */
export function isSettled(
  grandTotal: SafeMathInput,
  totalPaid: SafeMathInput,
): boolean {
  const total = Number(grandTotal ?? 0)
  if (!(total > 0)) return false
  return settlementOutstanding(grandTotal, totalPaid) <= SETTLEMENT_TOLERANCE_IDR
}

/**
 * Status bayar turunan dari outstanding valid:
 * - lunas (dalam toleransi) -> "paid"
 * - ada pembayaran valid > 0 -> "partial"
 * - selain itu -> "posted" (terbuka, belum dibayar)
 *
 * `paid` di sini nilai paymentStatus/status bayar, bukan status dokumen
 * (draft/cancelled ditangani pemanggil sebelum fungsi ini).
 */
export function derivePaymentStatus(
  grandTotal: SafeMathInput,
  totalPaid: SafeMathInput,
): "paid" | "partial" | "posted" {
  if (isSettled(grandTotal, totalPaid)) return "paid"
  if (Number(totalPaid ?? 0) > 0) return "partial"
  return "posted"
}
