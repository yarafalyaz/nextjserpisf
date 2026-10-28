/**
 * Data laporan penerimaan & pembayaran per rekening bank.
 *
 * **Nilai penerimaan memakai `SalesPayment.amount`, bukan `amount + withholdingAmount`.**
 * PPh yang dipotong pelanggan tidak pernah masuk rekening, jadi menambahkannya
 * akan membuat laporan ini tidak cocok dengan rekening koran. Nilai potongan tetap
 * ada di laporan Bukti Potong PPh — di sana yang dibahas memang pajaknya.
 *
 * Pembayaran vendor dihitung hanya yang berstatus `completed`: pembayaran draft
 * belum mengeluarkan uang dari bank.
 */

import { prisma } from "@/lib/db/prisma"
import { activeSalesPaymentWhere } from "@/lib/finance/payment-status"
import {
  buildBankMovements,
  type BankMovementInput,
  type BankMovementsResult,
} from "@/lib/reports/bank-movements"
import { rangePeriodLabels } from "@/lib/reports/period-label"

export interface BankMovementsReport {
  movements: BankMovementsResult
  periodLabel: string
  periodCaption: string
}

export async function loadBankMovements(period: {
  start: Date
  end: Date
}): Promise<BankMovementsReport> {
  const [salesPayments, vendorPayments] = await Promise.all([
    prisma.salesPayment.findMany({
      where: activeSalesPaymentWhere({ paymentDate: { gte: period.start, lte: period.end } }),
      select: {
        id: true,
        documentNo: true,
        paymentDate: true,
        accountId: true,
        amount: true,
        salesInvoice: { select: { customer: { select: { name: true } } } },
      },
      orderBy: { paymentDate: "asc" },
    }),
    prisma.vendorPayment.findMany({
      where: {
        paymentDate: { gte: period.start, lte: period.end },
        status: "completed",
        deletedAt: null,
      },
      select: {
        id: true,
        documentNo: true,
        paymentDate: true,
        accountId: true,
        amount: true,
        vendor: { select: { name: true } },
      },
      orderBy: { paymentDate: "asc" },
    }),
  ])

  const accountIds = [
    ...new Set(
      [...salesPayments, ...vendorPayments]
        .map((payment) => payment.accountId)
        .filter((id): id is number => id !== null),
    ),
  ]
  const accounts = accountIds.length
    ? await prisma.account.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, code: true, name: true },
      })
    : []
  const accountById = new Map(accounts.map((account) => [account.id, account]))

  const describeAccount = (accountId: number | null) => {
    const account = accountId !== null ? accountById.get(accountId) : undefined
    return { accountCode: account?.code ?? null, accountName: account?.name ?? null }
  }

  const movements: BankMovementInput[] = [
    ...salesPayments.map((payment) => ({
      accountId: payment.accountId,
      ...describeAccount(payment.accountId),
      date: payment.paymentDate,
      kind: "Penerimaan" as const,
      documentNo: payment.documentNo,
      counterparty: payment.salesInvoice?.customer?.name ?? null,
      amount: Number(payment.amount),
    })),
    ...vendorPayments.map((payment) => ({
      accountId: payment.accountId,
      ...describeAccount(payment.accountId),
      date: payment.paymentDate,
      kind: "Pengeluaran" as const,
      documentNo: payment.documentNo,
      counterparty: payment.vendor?.name ?? null,
      amount: Number(payment.amount),
    })),
  ]

  return {
    movements: buildBankMovements({ movements, start: period.start, end: period.end }),
    ...rangePeriodLabels(period),
  }
}
