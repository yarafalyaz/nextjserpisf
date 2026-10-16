/**
 * Pemuatan data untuk laporan **Histori Proses Penjualan**.
 *
 * Nilai ditagih = Σ `SalesInvoice.grandTotal`; dibayar = Σ `SalesInvoice.paidAmount`
 * (keduanya sudah disimpan per faktur) sehingga tidak perlu menjumlah ulang
 * pembayaran — kalau dihitung sendiri bisa berbeda dari saldo piutang modul lain.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildSalesProcessHistory,
  type SalesProcessLine,
  type SalesProcessResult,
} from "@/lib/reports/sales-process-history"
import { rangePeriodLabels } from "@/lib/reports/period-label"

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
    invoiced: order.salesInvoices.reduce((sum, invoice) => sum + Number(invoice.grandTotal), 0),
    paid: order.salesInvoices.reduce((sum, invoice) => sum + Number(invoice.paidAmount), 0),
  }))

  return {
    result: buildSalesProcessHistory(lines),
    ...rangePeriodLabels(period),
  }
}
