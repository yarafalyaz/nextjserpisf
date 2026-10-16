/**
 * Pemuatan data laporan **Tukar Faktur** (Rincian Tukar Faktur).
 *
 * Nilai "dibayar" dihitung dari `SalesInvoice.paidAmount` tiap faktur yang
 * diserahkan — sumber yang sama dipakai modul piutang — sehingga status pelunasan
 * di laporan selalu mengikuti pembayaran terbaru.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildInvoiceExchangeListing,
  type ExchangeReportLine,
  type ExchangeReportResult,
} from "@/lib/finance/invoice-exchange"
import { rangePeriodLabels } from "@/lib/reports/period-label"

export interface InvoiceExchangesReport {
  result: ExchangeReportResult
  periodLabel: string
  periodCaption: string
}

export async function loadInvoiceExchanges(period: {
  start: Date
  end: Date
}): Promise<InvoiceExchangesReport> {
  const exchanges = await prisma.invoiceExchange.findMany({
    where: { date: { gte: period.start, lte: period.end }, deletedAt: null },
    select: {
      date: true,
      documentNo: true,
      receiptNumber: true,
      dueDate: true,
      customer: { select: { name: true } },
      items: { select: { salesInvoice: { select: { grandTotal: true, paidAmount: true } } } },
    },
    orderBy: { date: "asc" },
  })

  const lines: ExchangeReportLine[] = exchanges.map((exchange) => ({
    date: exchange.date,
    documentNo: exchange.documentNo,
    customerName: exchange.customer.name,
    receiptNumber: exchange.receiptNumber,
    dueDate: exchange.dueDate,
    invoiceCount: exchange.items.length,
    amount: exchange.items.reduce((sum, item) => sum + Number(item.salesInvoice.grandTotal), 0),
    paid: exchange.items.reduce((sum, item) => sum + Number(item.salesInvoice.paidAmount), 0),
  }))

  return { result: buildInvoiceExchangeListing(lines), ...rangePeriodLabels(period) }
}
