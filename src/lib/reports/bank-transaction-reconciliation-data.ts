/**
 * Pemuatan data untuk laporan **Transaksi Bank Terekonsiliasi vs Belum**.
 *
 * Membaca baris rekening koran (`BankStatementLine`) pada periode, lalu menandai
 * terekonsiliasi bila status barisnya `matched` **atau** baris itu dipakai oleh
 * item rekonsiliasi yang dicocokkan. Alasan dua sumber ini ada di catatan
 * `bank-transaction-reconciliation.ts`.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildBankTransactionReconciliation,
  type BankTransactionInput,
  type BankTransactionReconciliationResult,
} from "@/lib/reports/bank-transaction-reconciliation"
import { rangePeriodLabels } from "@/lib/reports/period-label"

export interface BankTransactionReconciliationReport {
  report: BankTransactionReconciliationResult
  periodLabel: string
  periodCaption: string
}

export async function loadBankTransactionReconciliation(period: {
  start: Date
  end: Date
}): Promise<BankTransactionReconciliationReport> {
  const lines = await prisma.bankStatementLine.findMany({
    where: {
      date: { gte: period.start, lte: period.end },
      bankStatement: { deletedAt: null },
    },
    select: {
      id: true,
      date: true,
      description: true,
      reference: true,
      debit: true,
      credit: true,
      status: true,
      bankStatement: { select: { accountId: true, accountNumber: true } },
    },
    orderBy: { date: "asc" },
  })

  const lineIds = lines.map((line) => line.id)
  const matchedItems = lineIds.length
    ? await prisma.bankReconciliationItem.findMany({
        where: { bankStatementLineId: { in: lineIds }, matched: true },
        select: { bankStatementLineId: true },
      })
    : []
  const matchedLineIds = new Set(matchedItems.map((item) => item.bankStatementLineId))

  const accountIds = [...new Set(lines.map((line) => line.bankStatement.accountId))]
  const accounts = accountIds.length
    ? await prisma.account.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, code: true, name: true },
      })
    : []
  const accountById = new Map(accounts.map((account) => [account.id, account]))

  const inputs: BankTransactionInput[] = lines.map((line) => {
    const account = accountById.get(line.bankStatement.accountId)
    const accountLabel =
      account?.name != null ? `${account.code} ${account.name}` : line.bankStatement.accountNumber

    return {
      date: line.date,
      accountLabel,
      description: line.description,
      reference: line.reference,
      inflow: Number(line.debit),
      outflow: Number(line.credit),
      reconciled: line.status === "matched" || matchedLineIds.has(line.id),
    }
  })

  return {
    report: buildBankTransactionReconciliation(inputs),
    ...rangePeriodLabels(period),
  }
}
