/**
 * Pemuatan data laporan **Uang Muka Pembelian**.
 *
 * Melaporkan uang muka yang **dibayarkan** pada periode (bukan sisa yang belum
 * terpakai — penerapan ke tagihan vendor belum ada di sistem).
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildAdvanceListing,
  type AdvanceReportLine,
  type AdvanceReportResult,
} from "@/lib/finance/purchase-advance"
import { rangePeriodLabels } from "@/lib/reports/period-label"

export interface PurchaseAdvancesReport {
  result: AdvanceReportResult
  periodLabel: string
  periodCaption: string
}

export async function loadPurchaseAdvances(period: {
  start: Date
  end: Date
}): Promise<PurchaseAdvancesReport> {
  const advances = await prisma.purchaseAdvance.findMany({
    where: { date: { gte: period.start, lte: period.end }, deletedAt: null },
    select: {
      date: true,
      documentNo: true,
      description: true,
      amount: true,
      vendor: { select: { name: true } },
    },
    orderBy: { date: "asc" },
  })

  const lines: AdvanceReportLine[] = advances.map((advance) => ({
    date: advance.date,
    documentNo: advance.documentNo,
    vendorName: advance.vendor.name,
    description: advance.description,
    amount: Number(advance.amount),
  }))

  return { result: buildAdvanceListing(lines), ...rangePeriodLabels(period) }
}
