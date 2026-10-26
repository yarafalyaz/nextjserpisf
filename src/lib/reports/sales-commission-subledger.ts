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
 * Builder murni: tanpa Prisma, tanpa tulis apa pun. Angka dibaca apa
 * adanya dari baris subledger; builder TIDAK menulis/mengedit baris
 * asal (QA-KOM49-7: baca tidak menulis).
 */

import { safeRound, safeSubtract } from "@/lib/utils/math"
import {
  COMMISSION_LEDGER_NEGATIVE_REASON,
  COMMISSION_LEDGER_OVERRUN_REASON,
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
  salesEmployeeName: string
  accruedAmount: number
  reversalAmount: number
  paidAmount: number
  /** A − R − P; boleh negatif (retur sesudah terbayar), tidak di-clamp. */
  balance: number
  status: SalesCommissionSubledgerStatus
}

export interface SalesCommissionSubledgerReconciliation {
  salesInvoiceId: number
  salesEmployeeId: number
  reason: string
}

export interface SalesCommissionSubledgerRow {
  salesEmployeeId: number
  salesEmployeeName: string
  accruedAmount: number
  reversalAmount: number
  paidAmount: number
  balance: number
  lines: SalesCommissionSubledgerLine[]
}

function deriveStatus(a: number, r: number, p: number): SalesCommissionSubledgerStatus {
  const accrued = safeRound(a, 2)
  const reversal = safeRound(r, 2)
  const paid = safeRound(p, 2)
  const remaining = safeRound(safeSubtract(accrued, reversal, 2), 2)
  if (paid > remaining) return "OVERPAID_NEGATIVE"
  if (reversal >= accrued && accrued > 0) return "REVERSED"
  if (remaining > 0 && paid >= remaining) return "PAID"
  if (paid > 0) return "PARTIALLY_PAID"
  return "ACCRUED"
}

export function buildSalesCommissionSubledger(
  entries: readonly SalesCommissionPayableEntryInput[],
): {
  rows: SalesCommissionSubledgerRow[]
  totalBalance: number
  reconciliations: SalesCommissionSubledgerReconciliation[]
} {
  const byEmployee = new Map<number, SalesCommissionSubledgerRow>()
  const reconciliations: SalesCommissionSubledgerReconciliation[] = []
  let totalBalance = 0
  for (const e of entries) {
    const balance = safeRound(
      safeSubtract(safeSubtract(e.accruedAmount, e.reversalAmount, 2), e.paidAmount, 2),
      2,
    )
    if (safeRound(e.reversalAmount, 2) > safeRound(e.accruedAmount, 2)) {
      reconciliations.push({
        salesInvoiceId: e.salesInvoiceId,
        salesEmployeeId: e.salesEmployeeId,
        reason: COMMISSION_LEDGER_OVERRUN_REASON,
      })
    } else if (balance < 0) {
      reconciliations.push({
        salesInvoiceId: e.salesInvoiceId,
        salesEmployeeId: e.salesEmployeeId,
        reason: COMMISSION_LEDGER_NEGATIVE_REASON,
      })
    }
    const row = byEmployee.get(e.salesEmployeeId) ?? {
      salesEmployeeId: e.salesEmployeeId,
      salesEmployeeName: e.salesEmployeeName ?? "",
      accruedAmount: 0,
      reversalAmount: 0,
      paidAmount: 0,
      balance: 0,
      lines: [],
    }
    row.accruedAmount = safeRound(row.accruedAmount + e.accruedAmount, 2)
    row.reversalAmount = safeRound(row.reversalAmount + e.reversalAmount, 2)
    row.paidAmount = safeRound(row.paidAmount + e.paidAmount, 2)
    row.balance = safeRound(row.balance + balance, 2)
    if (!row.salesEmployeeName && e.salesEmployeeName) row.salesEmployeeName = e.salesEmployeeName
    row.lines.push({
      salesInvoiceId: e.salesInvoiceId,
      salesEmployeeId: e.salesEmployeeId,
      salesEmployeeName: e.salesEmployeeName ?? "",
      accruedAmount: safeRound(e.accruedAmount, 2),
      reversalAmount: safeRound(e.reversalAmount, 2),
      paidAmount: safeRound(e.paidAmount, 2),
      balance,
      status: deriveStatus(e.accruedAmount, e.reversalAmount, e.paidAmount),
    })
    byEmployee.set(e.salesEmployeeId, row)
    totalBalance = safeRound(totalBalance + balance, 2)
  }
  return {
    rows: [...byEmployee.values()].sort((a, b) => a.salesEmployeeId - b.salesEmployeeId),
    totalBalance: safeRound(totalBalance, 2),
    reconciliations,
  }
}
