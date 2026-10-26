/**
 * Builder murni status siklus hidup baris subledger komisi per penerima
 * (F-2026-10-25-049-S, konsumen vonis F-2026-10-25-049-V §3).
 *
 * Status baris akrual asal DITURUNKAN server dari tiga angkanya —
 * akrual A, kumulatif lawan R, kumulatif terbayar-slip P — bukan kolom
 * bebas, bukan input operator, bukan ditebak UI (QA-KOM49-6):
 * - REVERSED: R = A (lawan penuh / batal faktur) — tidak ada sisa hak.
 * - OVERPAID_NEGATIVE: P > A − R (hanya lahir dari retur sesudah terbayar,
 *   F-084-V §4 butir 4) — saldo negatif tercatat, tanpa clamp.
 * - PAID: P = A − R dan A − R > 0.
 * - PARTIALLY_PAID: P > 0 dan P < A − R.
 * - ACCRUED: R = 0 dan P = 0; baris 0 < R < A tetap terakru atas sisa
 *   (PARTIALLY_REVERSED bukan status bernama sendiri, vonis §3).
 *
 * Agregasi saldo per penerima memakai builder saldo #911 apa adanya
 * (buildSalesCommissionPayable ledgerAvailable:true) — builder ini hanya
 * menempelkan status turunan per baris. Builder murni: tanpa Prisma,
 * tanpa tulis apa pun (QA-KOM49-7: baca tidak menulis).
 */

import { safeRound, safeSubtract } from "@/lib/utils/math"
import {
  buildSalesCommissionPayable,
  type SalesCommissionPayable,
  type SalesCommissionPayableEntryInput,
} from "@/lib/reports/sales-commission-payable"

export type SalesCommissionSubledgerStatus =
  | "ACCRUED"
  | "PARTIALLY_PAID"
  | "PAID"
  | "REVERSED"
  | "OVERPAID_NEGATIVE"

export interface SalesCommissionSubledgerLine {
  salesInvoiceId: number
  salesEmployeeId: number
  status: SalesCommissionSubledgerStatus
}

export interface SalesCommissionSubledgerView {
  payable: SalesCommissionPayable
  /** Status turunan per (faktur, penerima), sejajar masukan baris subledger. */
  lineStatuses: SalesCommissionSubledgerLine[]
}

function deriveStatus(a: number, r: number, p: number): SalesCommissionSubledgerStatus {
  const accrued = safeRound(a, 2)
  const reversal = safeRound(r, 2)
  const paid = safeRound(p, 2)
  if (accrued > 0 && reversal >= accrued) return "REVERSED"
  const remaining = safeRound(safeSubtract(accrued, reversal, 2), 2)
  if (paid > remaining) return "OVERPAID_NEGATIVE"
  if (remaining > 0 && paid >= remaining) return "PAID"
  if (paid > 0) return "PARTIALLY_PAID"
  return "ACCRUED"
}

export function buildSalesCommissionSubledger(
  entries: readonly SalesCommissionPayableEntryInput[],
): SalesCommissionSubledgerView {
  return {
    payable: buildSalesCommissionPayable(entries, { ledgerAvailable: true }),
    lineStatuses: entries.map((e) => ({
      salesInvoiceId: e.salesInvoiceId,
      salesEmployeeId: e.salesEmployeeId,
      status: deriveStatus(e.accruedAmount, e.reversalAmount, e.paidAmount),
    })),
  }
}
