/**
 * Loader read-only rekap subledger komisi per penerima
 * (F-2026-10-25-049-S, konsumen vonis F-2026-10-25-049-V).
 *
 * Izin `view_reports` ditegakkan DI SINI fail-closed sebelum query apa
 * pun (pola delivered-unbilled-data.ts). Tanpa izin: nol baris bocor.
 *
 * LABEL KEJUJURAN (mengikat): model fisik subledger + hook
 * akrual/lawan/bayar satu-tx adalah INTI tahap 3 yang ditahan PUTUSAN
 * Lead G1 (vonis 049-V §7: "JANGAN bangun sebelum G1 terbit"). Selama
 * inti belum live, loader meneruskan `ledgerAvailable: false` ke
 * builder saldo #911 — saldo terbaca 0 berlabel jujur, BUKAN dibangun
 * dari rekap informatif (BR-KOM37-12). Read-model murni: nol tulis,
 * nol baris subledger lahir dari baca (QA-KOM49-7).
 */

import { requirePermission } from "@/lib/auth/permissions"
import {
  buildSalesCommissionPayable,
  type SalesCommissionPayable,
} from "@/lib/reports/sales-commission-payable"
import type { SalesCommissionSubledgerLine } from "@/lib/reports/sales-commission-subledger"

export interface SalesCommissionSubledgerRecap {
  payable: SalesCommissionPayable
  lineStatuses: SalesCommissionSubledgerLine[]
}

export async function getSalesCommissionSubledgerRecap(): Promise<SalesCommissionSubledgerRecap> {
  await requirePermission("view_reports")

  // ponytail: inti subledger ditahan G1 — ledgerAvailable:false jujur.
  // Upgrade: query massal model fisik + buildSalesCommissionSubledger
  // sesudah PUTUSAN G1 Lead terbit.
  return {
    payable: buildSalesCommissionPayable([], { ledgerAvailable: false }),
    lineStatuses: [],
  }
}
