/**
 * Data rincian beban pembayaran: biaya bank/administrasi dari pembayaran vendor
 * dan dari penerimaan barang.
 *
 * Hanya dokumen yang uangnya benar-benar bergerak yang dihitung — pembayaran
 * vendor berstatus `completed`, penerimaan barang berstatus `verified`/`completed`
 * (pasangan status yang sama dipakai saat menghitung penerimaan pada pesanan).
 * Draft belum membebani apa pun, jadi menampilkannya akan menggelembungkan beban.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildPaymentExpenses,
  type PaymentExpenseInput,
  type PaymentExpensesResult,
} from "@/lib/reports/payment-expenses"
import { rangePeriodLabels } from "@/lib/reports/period-label"

/** Status penerimaan barang yang sudah menggerakkan persediaan & jurnal. */
const POSTED_RECEIPT_STATUSES = ["verified", "completed"]

export interface PaymentExpensesReport {
  expenses: PaymentExpensesResult
  periodLabel: string
  periodCaption: string
}

export async function loadPaymentExpenses(period: {
  start: Date
  end: Date
}): Promise<PaymentExpensesReport> {
  const [vendorPayments, goodsReceipts] = await Promise.all([
    prisma.vendorPayment.findMany({
      where: {
        paymentDate: { gte: period.start, lte: period.end },
        status: "completed",
        deletedAt: null,
        adminFee: { gt: 0 },
      },
      select: {
        documentNo: true,
        paymentDate: true,
        adminFee: true,
        vendor: { select: { name: true } },
      },
      orderBy: { paymentDate: "asc" },
    }),
    prisma.goodsReceipt.findMany({
      where: {
        date: { gte: period.start, lte: period.end },
        status: { in: POSTED_RECEIPT_STATUSES },
        adminFee: { gt: 0 },
      },
      select: {
        documentNo: true,
        date: true,
        adminFee: true,
        purchaseOrder: { select: { vendor: { select: { name: true } } } },
      },
      orderBy: { date: "asc" },
    }),
  ])

  const expenses: PaymentExpenseInput[] = [
    ...vendorPayments.map((payment) => ({
      date: payment.paymentDate,
      documentNo: payment.documentNo,
      source: "Pembayaran Vendor" as const,
      counterparty: payment.vendor?.name ?? null,
      adminFee: Number(payment.adminFee),
    })),
    ...goodsReceipts.map((receipt) => ({
      date: receipt.date,
      documentNo: receipt.documentNo,
      source: "Penerimaan Barang" as const,
      counterparty: receipt.purchaseOrder?.vendor?.name ?? null,
      adminFee: Number(receipt.adminFee),
    })),
  ]

  return {
    expenses: buildPaymentExpenses({ expenses, start: period.start, end: period.end }),
    ...rangePeriodLabels(period),
  }
}
