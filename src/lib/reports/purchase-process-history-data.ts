/**
 * Pemuatan data untuk laporan **Histori Proses Pembelian**.
 *
 * Hanya tagihan recognised (posted/partial/paid, tidak terhapus) yang
 * dihitung: draft/cancelled bukan utang. Sisa builder memakai Σ
 * `VendorBill.balanceDue` tersimpan (neto PPh + relief retur), bukan
 * hitung ulang grandTotal − paidAmount dari kop.
 */

import { prisma } from "@/lib/db/prisma"
import { sumMoney } from "@/lib/reports/aging-amounts"
import { RECOGNISED_AP_STATUSES } from "@/lib/reports/document-status"
import {
  buildPurchaseProcessHistory,
  type PurchaseProcessLine,
  type PurchaseProcessResult,
} from "@/lib/reports/purchase-process-history"
import { rangePeriodLabels } from "@/lib/reports/period-label"

/** Σ grandTotal/paidAmount/balanceDue tagihan, presisi sen (bukan float mentah). */
export function sumBillAmounts(
  bills: readonly { grandTotal: unknown; paidAmount: unknown; balanceDue?: unknown }[],
): { billed: number; paid: number; outstandingDue: number } {
  return {
    billed: sumMoney(bills.map((b) => b.grandTotal as never)),
    paid: sumMoney(bills.map((b) => b.paidAmount as never)),
    outstandingDue: sumMoney(bills.map((b) => (b.balanceDue ?? 0) as never)),
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
      vendorBills: {
        where: { status: { in: [...RECOGNISED_AP_STATUSES] }, deletedAt: null },
        select: { grandTotal: true, paidAmount: true, balanceDue: true },
      },
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
