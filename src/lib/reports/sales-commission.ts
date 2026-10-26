/**
 * Builder murni rekap komisi penjualan informatif (F-2026-10-21-016 tahap 2,
 * diperluas F-2026-10-25-036-S).
 *
 * Tahap 1 memberi snapshot `salesEmployeeId` di Quotation -> SalesOrder ->
 * SalesInvoice. Snapshot tarif (persen + kategori acuan) dibekukan di
 * SalesInvoice pada transisi ke `paid`, hasil resolusi histori tarif per
 * kategori pelanggan PER TANGGAL FAKTUR (BR-KT36-04); loader meneruskan
 * snapshot itu apa adanya — faktur lama tanpa snapshot terbaca persen 0
 * jujur (BR-KT36-13, tanpa backfill).
 *
 * Basis komisi per faktur = DPP = `grandTotal − taxAmount` snapshot faktur
 * (BR-KT36-05, vonis F-2026-10-22-056-V Putusan 2); faktur tanpa PPN basis
 * = grandTotal penuh. Retur completed mengurangi estimasi di MASA RETUR
 * sebesar Σ returnDpp × persen snapshot faktur asal (BR-KT36-07); neto
 * boleh negatif, tidak di-clamp (AC-KT-9).
 *
 * Label jujur wajib (frontend menempel apa adanya): angka INFORMATIF,
 * BUKAN utang komisi. Jurnal Dr Beban Komisi / Cr Utang Komisi = tahap 3
 * TERTUTUP (BR-KT36-12). Builder tidak menulis apa pun.
 *
 * Faktur tanpa penjual (salesEmployeeId null — dokumen lama) masuk ember
 * `unattributed`, tidak ditebak dari createdBy. Uang sen-aman lewat
 * `src/lib/utils/math`. Pure (tanpa Prisma/DOM).
 */

import { safeAdd, safeMultiply, safeRound, safeSubtract } from "@/lib/utils/math"

export const SALES_COMMISSION_NOTICE =
  "Rekap informatif dari snapshot penjual di faktur lunas — bukan utang " +
  "komisi, bukan dasar jurnal atau pembayaran. Persen 0 berarti tarif " +
  "belum diatur untuk baris itu. Basis komisi adalah DPP faktur (total " +
  "faktur dikurangi PPN), dikurangi retur selesai pada masa berjalan."

export interface SalesCommissionInvoiceInput {
  salesEmployeeId: number | null
  salesEmployeeName: string | null
  grandTotal: number
  /** PPN snapshot faktur; DPP = grandTotal − taxAmount (BR-KT36-05). */
  taxAmount?: number
  commissionPercent: number
}

export interface SalesCommissionReturnInput {
  /** Penjual snapshot faktur asal (BR-KT36-07). */
  salesEmployeeId: number | null
  salesEmployeeName: string | null
  /** Σ returnDpp baris retur completed (snapshot; fallback legacy di loader). */
  returnDppTotal: number
  /** Persen snapshot faktur asal. */
  commissionPercent: number
}

export interface SalesCommissionRow {
  salesEmployeeId: number
  salesEmployeeName: string
  invoiceCount: number
  /** Basis grandTotal faktur lunas (kolom lama; basis komisi = dppBase). */
  paidBase: number
  /** Basis DPP lunas = Σ (grandTotal − taxAmount) (BR-KT36-05). */
  dppBase: number
  estimatedCommission: number
  /** Pengurang estimasi dari retur completed masa ini (BR-KT36-07). */
  returnDeduction: number
  /** estimatedCommission − returnDeduction; boleh negatif (AC-KT-9). */
  netEstimatedCommission: number
}

export interface SalesCommissionRecap {
  rows: SalesCommissionRow[]
  unattributed: { invoiceCount: number; paidBase: number; dppBase: number }
  totalPaidBase: number
  totalDppBase: number
  totalEstimatedCommission: number
  totalReturnDeduction: number
  totalNetEstimatedCommission: number
  notice: string
}

function emptyRow(salesEmployeeId: number, name: string | null): SalesCommissionRow {
  return {
    salesEmployeeId,
    salesEmployeeName: name ?? "",
    invoiceCount: 0,
    paidBase: 0,
    dppBase: 0,
    estimatedCommission: 0,
    returnDeduction: 0,
    netEstimatedCommission: 0,
  }
}

export function buildSalesCommissionRecap(
  invoices: readonly SalesCommissionInvoiceInput[],
  returns: readonly SalesCommissionReturnInput[] = [],
): SalesCommissionRecap {
  const byEmployee = new Map<number, SalesCommissionRow>()
  let unattrCount = 0
  let unattrBase = 0
  let unattrDpp = 0
  for (const inv of invoices) {
    const base = safeRound(inv.grandTotal, 2)
    const dpp = safeRound(safeSubtract(base, inv.taxAmount ?? 0, 2), 2)
    if (inv.salesEmployeeId === null) {
      unattrCount += 1
      unattrBase = safeAdd(unattrBase, base, 2)
      unattrDpp = safeAdd(unattrDpp, dpp, 2)
      continue
    }
    const row = byEmployee.get(inv.salesEmployeeId) ?? emptyRow(inv.salesEmployeeId, inv.salesEmployeeName)
    row.invoiceCount += 1
    row.paidBase = safeAdd(row.paidBase, base, 2)
    row.dppBase = safeAdd(row.dppBase, dpp, 2)
    row.estimatedCommission = safeAdd(
      row.estimatedCommission,
      safeRound(safeMultiply(dpp, inv.commissionPercent, 4) / 100, 2),
      2,
    )
    if (!row.salesEmployeeName && inv.salesEmployeeName) {
      row.salesEmployeeName = inv.salesEmployeeName
    }
    byEmployee.set(inv.salesEmployeeId, row)
  }
  // Retur masa ini: pengurang per penjual faktur asal (BR-KT36-07). Baris
  // penjual tanpa faktur lunas masa ini tetap lahir supaya neto negatif
  // tampil apa adanya (AC-KT-9). Retur tanpa penjual asal tidak ditebak.
  for (const ret of returns) {
    if (ret.salesEmployeeId === null) continue
    const row = byEmployee.get(ret.salesEmployeeId) ?? emptyRow(ret.salesEmployeeId, ret.salesEmployeeName)
    row.returnDeduction = safeAdd(
      row.returnDeduction,
      safeRound(safeMultiply(safeRound(ret.returnDppTotal, 2), ret.commissionPercent, 4) / 100, 2),
      2,
    )
    if (!row.salesEmployeeName && ret.salesEmployeeName) {
      row.salesEmployeeName = ret.salesEmployeeName
    }
    byEmployee.set(ret.salesEmployeeId, row)
  }
  for (const row of byEmployee.values()) {
    row.netEstimatedCommission = safeSubtract(row.estimatedCommission, row.returnDeduction, 2)
  }
  const rows = [...byEmployee.values()].sort((a, b) => {
    if (a.dppBase !== b.dppBase) return b.dppBase - a.dppBase
    return a.salesEmployeeId - b.salesEmployeeId
  })
  return {
    rows,
    unattributed: {
      invoiceCount: unattrCount,
      paidBase: safeRound(unattrBase, 2),
      dppBase: safeRound(unattrDpp, 2),
    },
    totalPaidBase: safeRound(
      rows.reduce((sum, r) => safeAdd(sum, r.paidBase, 2), unattrBase),
      2,
    ),
    totalDppBase: safeRound(
      rows.reduce((sum, r) => safeAdd(sum, r.dppBase, 2), unattrDpp),
      2,
    ),
    totalEstimatedCommission: safeRound(
      rows.reduce((sum, r) => safeAdd(sum, r.estimatedCommission, 2), 0),
      2,
    ),
    totalReturnDeduction: safeRound(
      rows.reduce((sum, r) => safeAdd(sum, r.returnDeduction, 2), 0),
      2,
    ),
    totalNetEstimatedCommission: safeRound(
      rows.reduce((sum, r) => safeAdd(sum, r.netEstimatedCommission, 2), 0),
      2,
    ),
    notice: SALES_COMMISSION_NOTICE,
  }
}
