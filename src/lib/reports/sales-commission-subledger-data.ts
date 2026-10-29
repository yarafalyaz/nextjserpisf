/**
 * Loader read-only rekap subledger komisi per penerima
 * (F-2026-10-25-049-S, konsumen vonis F-2026-10-25-049-V).
 *
 * Izin `view_reports` ditegakkan DI SINI fail-closed sebelum query apa
 * pun (pola delivered-unbilled-data.ts). Tanpa izin: nol baris bocor.
 *
 * Tahap 3 live (G1 terbit): memuat baris fisik `commissionPayable` +
 * status turunan server per baris. Read-model murni: nol tulis,
 * nol baris subledger lahir dari baca (QA-KOM49-7).
 */

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import {
  buildSalesCommissionPayable,
  type SalesCommissionPayable,
} from "@/lib/reports/sales-commission-payable"
import {
  buildSalesCommissionSubledger,
  type SalesCommissionSubledgerLine,
} from "@/lib/reports/sales-commission-subledger"

export interface SalesCommissionSubledgerRecap {
  payable: SalesCommissionPayable
  lineStatuses: SalesCommissionSubledgerLine[]
}

export async function getSalesCommissionSubledgerRecap(): Promise<SalesCommissionSubledgerRecap> {
  await requirePermission("view_reports")

  const rows = await prisma.commissionPayable.findMany({
    include: { salesEmployee: { select: { name: true } } },
    orderBy: { id: "asc" },
  })
  const entries = rows.map((r) => ({
    salesInvoiceId: r.salesInvoiceId,
    salesEmployeeId: r.salesEmployeeId,
    salesEmployeeName: r.salesEmployee?.name ?? null,
    accruedAmount: Number(r.accruedAmount),
    reversalAmount: Number(r.reversalAmount),
    paidAmount: Number(r.paidAmount),
  }))
  return {
    payable: buildSalesCommissionPayable(entries, { ledgerAvailable: true }),
    lineStatuses: buildSalesCommissionSubledger(entries).lineStatuses,
  }
}
