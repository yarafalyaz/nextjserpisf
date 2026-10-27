/**
 * Loader read-model saldo utang komisi (F-2026-10-25-037-S §5, konsumen
 * builder `buildSalesCommissionPayable` PR #911).
 *
 * Inti tahap 3 (subledger per faktur-penerima + jurnal akrual/lawan/terbayar
 * akun 210212) BELUM live di main: tidak ada baris subledger yang bisa
 * dibaca, jadi pemanggil wajib meneruskan `ledgerAvailable: false` dan
 * saldo terbaca 0 berlabel jujur (BR-KOM37-12: rekap informatif BUKAN
 * utang — dilarang membangun baris saldo dari rekap). Sesudah inti live,
 * loader ini yang memuat baris subledger+jurnal menjadi entri builder.
 *
 * Read-only murni: tanpa Prisma (tidak ada model subledger), tanpa tulis.
 */

import {
  buildSalesCommissionPayable,
  type SalesCommissionPayable,
} from "@/lib/reports/sales-commission-payable"

export async function getSalesCommissionPayable(): Promise<SalesCommissionPayable> {
  return buildSalesCommissionPayable([], { ledgerAvailable: false })
}
