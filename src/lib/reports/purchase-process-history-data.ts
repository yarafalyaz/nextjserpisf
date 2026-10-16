/**
 * Pemuatan data untuk laporan **Histori Proses Pembelian**.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildPurchaseProcessHistory,
  type PurchaseProcessLine,
  type PurchaseProcessResult,
} from "@/lib/reports/purchase-process-history"
import { rangePeriodLabels } from "@/lib/reports/period-label"

export interface PurchaseProcessReport {
  result: PurchaseProcessResult
  periodLabel: string
  periodCaption: string
}

export async function loadPurchaseProcessHistory(period: {
  start: Date
  end: Date
}): Promise<PurchaseProcessReport> {
  const orders = await prisma.purchaseOrder.findMany({
    where: { date: { gte: period.start, lte: period.end }, deletedAt: null },
    select: {
      documentNo: true,
      date: true,
      status: true,
      vendor: { select: { name: true } },
      purchaseRequest: { select: { documentNo: true } },
      goodsReceipts: { select: { id: true } },
      vendorBills: { select: { grandTotal: true, paidAmount: true } },
    },
    orderBy: { date: "desc" },
  })

  const lines: PurchaseProcessLine[] = orders.map((order) => ({
    orderNo: order.documentNo,
    date: order.date,
    vendorName: order.vendor.name,
    status: order.status,
    requestNo: order.purchaseRequest?.documentNo ?? null,
    receiptCount: order.goodsReceipts.length,
    billCount: order.vendorBills.length,
    billed: order.vendorBills.reduce((sum, bill) => sum + Number(bill.grandTotal), 0),
    paid: order.vendorBills.reduce((sum, bill) => sum + Number(bill.paidAmount), 0),
  }))

  return {
    result: buildPurchaseProcessHistory(lines),
    ...rangePeriodLabels(period),
  }
}
