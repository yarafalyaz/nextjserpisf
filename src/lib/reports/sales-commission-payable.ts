/**
 * Builder murni read-model saldo utang komisi per penjual
 * (F-2026-10-25-037-S §5, lapis persiapan tahap 3).
 *
 * Saldo per baris subledger = akrual − lawan (retur/batal) − terbayar-slip.
 * Kumulatif lawan melebihi akrual = pelanggaran BR-KOM37-07: tampil sebagai
 * baris rekonsiliasi beralasan, nominal tidak di-clamp. Saldo penjual boleh
 * negatif tercatat sesudah komisi terbayar lalu retur lahir (BR-KOM37-08) —
 * tidak di-clamp 0, tidak ditarik kas.
 *
 * PENTING — label kejujuran: ini TURUNAN dari baris subledger+jurnal yang
 * diteruskan pemanggil. Selama inti tahap 3 G1/G2 belum live tidak ada
 * subledger/jurnal komisi di main, jadi pemanggil wajib meneruskan
 * `ledgerAvailable: false` dan saldo terbaca 0 berlabel jujur — JANGAN
 * bangun baris saldo dari rekap informatif (BR-KOM37-12: rekap bukan utang).
 * Builder murni: tanpa Prisma, tanpa tulis apa pun ponsel.
 */

import { safeAdd, safeRound, safeSubtract } from "@/lib/utils/math"

export const SALES_COMMISSION_PAYABLE_NOTICE =
  "Saldo utang komisi tercatat dari subledger dan jurnal komisi (tahap 3) — " +
  "terpisah dari rekap informatif; rekap bukan utang dan keduanya " +
  "direkonsiliasi per faktur, tidak disamakan paksa."

export const SALES_COMMISSION_PAYABLE_UNAVAILABLE_NOTICE =
  "Subledger dan jurnal utang komisi belum tersedia (inti tahap 3 belum " +
  "live) — saldo utang komisi terbaca 0; rekap informatif tetap bukan utang."

export const COMMISSION_LEDGER_OVERRUN_REASON = "lawan-melebihi-akrual"
export const COMMISSION_LEDGER_NEGATIVE_REASON = "saldo-negatif-retur-sesudah-terbayar"

export interface SalesCommissionPayableEntryInput {
  salesInvoiceId: number
  salesEmployeeId: number
  salesEmployeeName: string | null
  /** Nominal akrual jurnal (sen-aman, 2 desimal) dari snapshot faktur. */
  accruedAmount: number
  /** Kumulatif jurnal lawan tertaut baris ini (retur/batal). */
  reversalAmount: number
  /** Kumulatif terbayar lewat komponen slip payroll tertaut. */
  paidAmount: number
}

export interface SalesCommissionPayableLine {
  salesInvoiceId: number
  salesEmployeeId: number
  accruedAmount: number
  reversalAmount: number
  paidAmount: number
  /** accrued − reversal − paid; boleh negatif (BR-KOM37-08), tidak di-clamp. */
  balance: number
}

export interface SalesCommissionPayableReconciliation {
  salesInvoiceId: number
  salesEmployeeId: number
  reason: string
}

export interface SalesCommissionPayableRow {
  salesEmployeeId: number
  salesEmployeeName: string
  accruedAmount: number
  reversalAmount: number
  paidAmount: number
  /** Boleh negatif tercatat (BR-KOM37-08); tidak di-clamp 0. */
  balance: number
  lines: SalesCommissionPayableLine[]
}

export interface SalesCommissionPayable {
  /** false = subledger/jurnal belum live; saldo selalu 0 berlabel jujur. */
  ledgerAvailable: boolean
  rows: SalesCommissionPayableRow[]
  totalBalance: number
  reconciliations: SalesCommissionPayableReconciliation[]
  notice: string
}

export function buildSalesCommissionPayable(
  entries: readonly SalesCommissionPayableEntryInput[],
  options: { ledgerAvailable: boolean },
): SalesCommissionPayable {
  if (!options.ledgerAvailable) {
    return {
      ledgerAvailable: false,
      rows: [],
      totalBalance: 0,
      reconciliations: [],
      notice: SALES_COMMISSION_PAYABLE_UNAVAILABLE_NOTICE,
    }
  }
  const byEmployee = new Map<number, SalesCommissionPayableRow>()
  const reconciliations: SalesCommissionPayableReconciliation[] = []
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
    row.accruedAmount = safeAdd(row.accruedAmount, e.accruedAmount, 2)
    row.reversalAmount = safeAdd(row.reversalAmount, e.reversalAmount, 2)
    row.paidAmount = safeAdd(row.paidAmount, e.paidAmount, 2)
    row.balance = safeAdd(row.balance, balance, 2)
    if (!row.salesEmployeeName && e.salesEmployeeName) row.salesEmployeeName = e.salesEmployeeName
    row.lines.push({
      salesInvoiceId: e.salesInvoiceId,
      salesEmployeeId: e.salesEmployeeId,
      accruedAmount: safeRound(e.accruedAmount, 2),
      reversalAmount: safeRound(e.reversalAmount, 2),
      paidAmount: safeRound(e.paidAmount, 2),
      balance,
    })
    byEmployee.set(e.salesEmployeeId, row)
    totalBalance = safeAdd(totalBalance, balance, 2)
  }
  const rows = [...byEmployee.values()].sort((a, b) => a.salesEmployeeId - b.salesEmployeeId)
  return {
    ledgerAvailable: true,
    rows,
    totalBalance: safeRound(totalBalance, 2),
    reconciliations,
    notice: SALES_COMMISSION_PAYABLE_NOTICE,
  }
}
