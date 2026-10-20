/**
 * Pemuatan data untuk laporan **Histori Proses Pembelian**.
 */

import { prisma } from "@/lib/db/prisma"
import { sumMoney } from "@/lib/reports/aging-amounts"
import {
  buildPurchaseProcessHistory,
  type PurchaseProcessLine,
  type PurchaseProcessResult,
} from "@/lib/reports/purchase-process-history"
import { rangePeriodLabels } from "@/lib/reports/period-label"

/** Σ grandTotal/paidAmount tagihan, presisi sen (bukan float mentah). */
export function sumBillAmounts(
  bills: readonly { grandTotal: unknown; paidAmount: unknown }[],
): { billed: number; paid: number } {
  return {
    billed: sumMoney(bills.map((b) => b.grandTotal as never)),
    paid: sumMoney(bills.map((b) => b.paidAmount as never)),
  }
}

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
    ...sumBillAmounts(order.vendorBills),
  }))

  return {
    result: buildPurchaseProcessHistory(lines),
    ...rangePeriodLabels(period),
  }
}
