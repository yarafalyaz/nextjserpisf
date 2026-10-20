/**
 * Pemuatan data untuk laporan **Histori Proses Penjualan**.
 *
 * Nilai ditagih = Σ `SalesInvoice.grandTotal`; dibayar = Σ `SalesInvoice.paidAmount`
 * (keduanya sudah disimpan per faktur) sehingga tidak perlu menjumlah ulang
 * pembayaran — kalau dihitung sendiri bisa berbeda dari saldo piutang modul lain.
 */

import { prisma } from "@/lib/db/prisma"
import { sumMoney } from "@/lib/reports/aging-amounts"
import {
  buildSalesProcessHistory,
  type SalesProcessLine,
  type SalesProcessResult,
} from "@/lib/reports/sales-process-history"
import { rangePeriodLabels } from "@/lib/reports/period-label"

/** Σ grandTotal/paidAmount faktur, presisi sen (bukan float mentah). */
export function sumInvoiceAmounts(
  invoices: readonly { grandTotal: unknown; paidAmount: unknown }[],
): { invoiced: number; paid: number } {
  return {
    invoiced: sumMoney(invoices.map((i) => i.grandTotal as never)),
    paid: sumMoney(invoices.map((i) => i.paidAmount as never)),
  }
}

export interface SalesProcessReport {
  result: SalesProcessResult
  periodLabel: string
  periodCaption: string
}

export async function loadSalesProcessHistory(period: {
  start: Date
  end: Date
}): Promise<SalesProcessReport> {
  const orders = await prisma.salesOrder.findMany({
    where: { date: { gte: period.start, lte: period.end }, deletedAt: null },
    select: {
      documentNo: true,
      date: true,
      status: true,
      customer: { select: { name: true } },
      deliveryOrders: { select: { id: true } },
      salesInvoices: { select: { grandTotal: true, paidAmount: true } },
    },
    orderBy: { date: "desc" },
  })

  const lines: SalesProcessLine[] = orders.map((order) => ({
    orderNo: order.documentNo,
    date: order.date,
    customerName: order.customer.name,
    status: order.status,
    deliveryCount: order.deliveryOrders.length,
    invoiceCount: order.salesInvoices.length,
    ...sumInvoiceAmounts(order.salesInvoices),
  }))

  return {
    result: buildSalesProcessHistory(lines),
    ...rangePeriodLabels(period),
  }
}
