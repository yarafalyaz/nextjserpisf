/**
 * Loader read-model saldo utang komisi (F-2026-10-25-037-S §5, konsumen
 * builder `buildSalesCommissionPayable`).
 *
 * Tahap 3 live: memuat baris subledger `commissionPayable` + nama penjual
 * menjadi entri builder. Tanpa baris = `ledgerAvailable: true`, saldo 0
 * tercatat (bukan "belum live"). Read-only: tanpa tulis.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildSalesCommissionPayable,
  type SalesCommissionPayable,
} from "@/lib/reports/sales-commission-payable"

export async function getSalesCommissionPayable(): Promise<SalesCommissionPayable> {
  const rows = await prisma.commissionPayable.findMany({
    include: { salesEmployee: { select: { name: true } } },
    orderBy: { id: "asc" },
  })
  return buildSalesCommissionPayable(
    rows.map((r) => ({
      salesInvoiceId: r.salesInvoiceId,
      salesEmployeeId: r.salesEmployeeId,
      salesEmployeeName: r.salesEmployee?.name ?? null,
      accruedAmount: Number(r.accruedAmount),
      reversalAmount: Number(r.reversalAmount),
      paidAmount: Number(r.paidAmount),
    })),
    { ledgerAvailable: true },
  )
}
