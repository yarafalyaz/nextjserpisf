/**
 * Builder murni rekap komisi penjualan informatif (F-2026-10-21-016 tahap 2).
 *
 * Tahap 1 memberi snapshot `salesEmployeeId` di Quotation -> SalesOrder ->
 * SalesInvoice. Rekap ini membaca snapshot faktur apa adanya: basis komisi
 * per penjual per masa = grandTotal faktur LUNAS (status `paid`) saja
 * (adaptasi backlog: "wajib basis status pembayaran; tahap 2 hanya baca
 * paid"). Persen diteruskan pemanggil per baris (commissionPercent); belum
 * ada setting persen per kategori pelanggan di schema, jadi loader
 * meneruskan 0 jujur — builder tidak menebak tarif.
 *
 * Label jujur wajib (frontend menempel apa adanya): angka INFORMATIF,
 * BUKAN utang komisi. Jurnal Dr Beban Komisi / Cr Utang Komisi = tahap 3
 * DITUNDA-TEKNIS vonis Lead 2026-10-21. Builder tidak menulis apa pun.
 *
 * Faktur tanpa penjual (salesEmployeeId null — dokumen lama) masuk ember
 * `unattributed`, tidak ditebak dari createdBy. Uang sen-aman lewat
 * `src/lib/utils/math`. Pure (tanpa Prisma/DOM).
 */

import { safeAdd, safeMultiply, safeRound } from "@/lib/utils/math"

export const SALES_COMMISSION_NOTICE =
  "Rekap informatif dari snapshot penjual di faktur lunas — bukan utang " +
  "komisi, bukan dasar jurnal atau pembayaran. Persen 0 berarti tarif " +
  "belum diatur untuk baris itu."

export interface SalesCommissionInvoiceInput {
  salesEmployeeId: number | null
  salesEmployeeName: string | null
  grandTotal: number
  commissionPercent: number
}

export interface SalesCommissionRow {
  salesEmployeeId: number
  salesEmployeeName: string
  invoiceCount: number
  paidBase: number
  estimatedCommission: number
}

export interface SalesCommissionRecap {
  rows: SalesCommissionRow[]
  unattributed: { invoiceCount: number; paidBase: number }
  totalPaidBase: number
  totalEstimatedCommission: number
  notice: string
}

export function buildSalesCommissionRecap(
  invoices: readonly SalesCommissionInvoiceInput[],
): SalesCommissionRecap {
  const byEmployee = new Map<number, SalesCommissionRow>()
  let unattrCount = 0
  let unattrBase = 0
  for (const inv of invoices) {
    const base = safeRound(inv.grandTotal, 2)
    if (inv.salesEmployeeId === null) {
      unattrCount += 1
      unattrBase = safeAdd(unattrBase, base, 2)
      continue
    }
    const row = byEmployee.get(inv.salesEmployeeId) ?? {
      salesEmployeeId: inv.salesEmployeeId,
      salesEmployeeName: inv.salesEmployeeName ?? "",
      invoiceCount: 0,
      paidBase: 0,
      estimatedCommission: 0,
    }
    row.invoiceCount += 1
    row.paidBase = safeAdd(row.paidBase, base, 2)
    row.estimatedCommission = safeAdd(
      row.estimatedCommission,
      safeRound(safeMultiply(base, inv.commissionPercent, 4) / 100, 2),
      2,
    )
    if (!row.salesEmployeeName && inv.salesEmployeeName) {
      row.salesEmployeeName = inv.salesEmployeeName
    }
    byEmployee.set(inv.salesEmployeeId, row)
  }
  const rows = [...byEmployee.values()].sort((a, b) => {
    if (a.paidBase !== b.paidBase) return b.paidBase - a.paidBase
    return a.salesEmployeeId - b.salesEmployeeId
  })
  return {
    rows,
    unattributed: { invoiceCount: unattrCount, paidBase: safeRound(unattrBase, 2) },
    totalPaidBase: safeRound(
      rows.reduce((sum, r) => safeAdd(sum, r.paidBase, 2), unattrBase),
      2,
    ),
    totalEstimatedCommission: safeRound(
      rows.reduce((sum, r) => safeAdd(sum, r.estimatedCommission, 2), 0),
      2,
    ),
    notice: SALES_COMMISSION_NOTICE,
  }
}
