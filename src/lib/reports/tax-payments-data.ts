/**
 * Pemuatan data laporan **Penyetoran Pajak** (per periode tanggal setor).
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildTaxPaymentListing,
  type TaxPaymentReportLine,
  type TaxPaymentReportResult,
} from "@/lib/finance/tax-payment"
import { rangePeriodLabels } from "@/lib/reports/period-label"

export interface TaxPaymentsReport {
  result: TaxPaymentReportResult
  periodLabel: string
  periodCaption: string
}

export async function loadTaxPayments(period: { start: Date; end: Date }): Promise<TaxPaymentsReport> {
  const payments = await prisma.taxPayment.findMany({
    where: { date: { gte: period.start, lte: period.end }, deletedAt: null },
    select: {
      date: true,
      documentNo: true,
      period: true,
      reference: true,
      amount: true,
      taxType: { select: { name: true } },
    },
    orderBy: { date: "asc" },
  })

  const lines: TaxPaymentReportLine[] = payments.map((payment) => ({
    date: payment.date,
    documentNo: payment.documentNo,
    period: payment.period,
    typeLabel: payment.taxType?.name ?? "Pajak",
    reference: payment.reference,
    amount: Number(payment.amount),
  }))

  return { result: buildTaxPaymentListing(lines), ...rangePeriodLabels(period) }
}
