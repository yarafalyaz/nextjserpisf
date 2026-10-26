/**
 * Loader read-only rekap subledger komisi per penerima
 * (F-2026-10-25-049-S, konsumen vonis F-2026-10-25-049-V).
 *
 * Izin `view_reports` ditegakkan DI SINI fail-closed sebelum query apa
 * pun (pola delivered-unbilled-data.ts); halaman pemanggil menegakkannya
 * juga sebelum loader. Tanpa izin: nol baris bocor.
 *
 * LABEL KEJUJURAN (mengikat): model fisik subledger (SalesCommissionAccrual
 * dkk) + hook akrual/lawan/bayar satu-tx adalah INTI tahap 3 yang ditahan
 * PUTUSAN Lead G1 (vonis 049-V §7: "JANGAN bangun sebelum G1 terbit").
 * Selama inti belum live, loader meneruskan `ledgerAvailable: false`
 * ke builder saldo #911 — saldo terbaca 0 berlabel jujur, BUKAN dibangun
 * dari rekap informatif (BR-KOM37-12). Loader ini read-model murni:
 * nol query tulis, nol baris subledger lahir dari baca (QA-KOM49-7).
 *
 * Sesudah G1 + model fisik live, loader ini diisi query massal baris
 * subledger (anti-N+1: satu findMany + agregasi Map di builder) dan
 * `ledgerAvailable: true` diteruskan apa adanya.
 */

import { requirePermission } from "@/lib/auth/permissions"
import {
  buildSalesCommissionPayable,
  type SalesCommissionPayable,
} from "@/lib/reports/sales-commission-payable"
import {
  buildSalesCommissionSubledger,
  type SalesCommissionSubledgerRow,
  type SalesCommissionSubledgerReconciliation,
} from "@/lib/reports/sales-commission-subledger"

export interface SalesCommissionSubledgerRecap {
  payable: SalesCommissionPayable
  rows: SalesCommissionSubledgerRow[]
  reconciliations: SalesCommissionSubledgerReconciliation[]
}

export async function getSalesCommissionSubledgerRecap(): Promise<SalesCommissionSubledgerRecap> {
  await requirePermission("view_reports")

  // ponytail: inti subledger ditahan G1 — ledgerAvailable:false jujur.
  // Upgrade: query massal model fisik sesudah PUTUSAN G1 Lead terbit.
  const payable = buildSalesCommissionPayable([], { ledgerAvailable: false })
  const subledger = buildSalesCommissionSubledger([])
  return {
    payable,
    rows: subledger.rows,
    reconciliations: subledger.reconciliations,
  }
}
