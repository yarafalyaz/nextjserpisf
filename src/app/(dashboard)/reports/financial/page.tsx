export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

/**
 * Trial Balance Report
 * Shows all accounts with their debit and credit totals
 */
async function getTrialBalanceData(startDate?: string, endDate?: string) {
  const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1) // Jan 1
  const end = endDate ? new Date(endDate) : new Date()

  const entries = await prisma.journalEntry.findMany({
    where: {
      journal: {
        status: "POSTED",
        transactionDate: { gte: start, lte: end },
      },
    },
    include: { account: true },
  })

  const accountBalances = new Map<number, {
    code: string
    name: string
    type: string
    totalDebit: number
    totalCredit: number
  }>()

  for (const entry of entries) {
    const existing = accountBalances.get(entry.accountId) || {
      code: entry.account.code,
      name: entry.account.name,
      type: entry.account.type,
      totalDebit: 0,
      totalCredit: 0,
    }

    existing.totalDebit += Number(entry.debit)
    existing.totalCredit += Number(entry.credit)
    accountBalances.set(entry.accountId, existing)
  }

  const accounts = Array.from(accountBalances.values()).sort((a, b) => a.code.localeCompare(b.code))

  const grandTotalDebit = accounts.reduce((sum, a) => sum + a.totalDebit, 0)
  const grandTotalCredit = accounts.reduce((sum, a) => sum + a.totalCredit, 0)

  return { accounts, grandTotalDebit, grandTotalCredit }
}

/**
 * Income Statement (P&L)
 */
async function getIncomeStatementData(startDate?: string, endDate?: string) {
  const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1)
  const end = endDate ? new Date(endDate) : new Date()

  const entries = await prisma.journalEntry.findMany({
    where: {
      journal: {
        status: "POSTED",
        transactionDate: { gte: start, lte: end },
      },
      account: { type: { in: ["REVENUE", "EXPENSE"] } },
    },
    include: { account: true },
  })

  const revenues: { code: string; name: string; amount: number }[] = []
  const expenses: { code: string; name: string; amount: number }[] = []

  const accountMap = new Map<number, { code: string; name: string; type: string; amount: number }>()

  for (const entry of entries) {
    const existing = accountMap.get(entry.accountId) || {
      code: entry.account.code,
      name: entry.account.name,
      type: entry.account.type,
      amount: 0,
    }

    if (entry.account.type === "REVENUE") {
      existing.amount += Number(entry.credit) - Number(entry.debit)
    } else {
      existing.amount += Number(entry.debit) - Number(entry.credit)
    }

    accountMap.set(entry.accountId, existing)
  }

  for (const [, acc] of accountMap) {
    if (acc.type === "REVENUE") revenues.push(acc)
    else expenses.push(acc)
  }

  revenues.sort((a, b) => a.code.localeCompare(b.code))
  expenses.sort((a, b) => a.code.localeCompare(b.code))

  const totalRevenue = revenues.reduce((sum, r) => sum + r.amount, 0)
  const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0)
  const netIncome = totalRevenue - totalExpense

  return { revenues, expenses, totalRevenue, totalExpense, netIncome }
}

export default async function FinancialReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string; startDate?: string; endDate?: string }>
}) {
  await requirePermission("view_reports")

  const params = await searchParams
  const reportType = params.report || "trial-balance"

  const trialBalance = reportType === "trial-balance" ? await getTrialBalanceData(params.startDate, params.endDate) : null
  const incomeStatement = reportType === "income-statement" ? await getIncomeStatementData(params.startDate, params.endDate) : null

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Reports", href: "/reports" },
  { label: "Financial" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">
          {reportType === "trial-balance" ? "Neraca Saldo (Trial Balance)" :
           reportType === "income-statement" ? "Laba Rugi (Income Statement)" :
           "Reports"}
        </h1>
      </div>

      {/* Report Selector */}
      <form className="bg-surface rounded-xl border border-default shadow-sm p-6" action="/reports/financial" style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "end" }}>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Jenis Laporan</label>
          <select name="report" className="form-input" defaultValue={reportType}>
            <option value="trial-balance">Neraca Saldo</option>
            <option value="income-statement">Laba Rugi</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Dari</label>
          <input type="date" name="startDate" className="form-input" defaultValue={params.startDate || `${new Date().getFullYear()}-01-01`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Sampai</label>
          <input type="date" name="endDate" className="form-input" defaultValue={params.endDate || new Date().toISOString().split("T")[0]} />
        </div>
        <button type="submit" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Generate</button>
      </form>

      {/* Trial Balance */}
      {reportType === "trial-balance" && trialBalance && (
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Nama Akun</th>
                  <th>Tipe</th>
                  <th style={{ textAlign: "right" }}>Debit</th>
                  <th style={{ textAlign: "right" }}>Credit</th>
                  <th style={{ textAlign: "right" }}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {trialBalance.accounts.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 px-4 text-muted">Belum ada data journal</td></tr>
                ) : (
                  trialBalance.accounts.map((acc) => (
                    <tr key={acc.code}>
                      <td className="font-mono">{acc.code}</td>
                      <td>{acc.name}</td>
                      <td><span className="px-3 py-1 rounded-full text-xs font-medium border border-default bg-background text-muted-foreground cursor-pointer transition-all capitalize hover:border-primary hover:text-primary">{acc.type}</span></td>
                      <td className="text-right">{formatCurrency(acc.totalDebit)}</td>
                      <td className="text-right">{formatCurrency(acc.totalCredit)}</td>
                      <td className="text-right"><strong>{formatCurrency(acc.totalDebit - acc.totalCredit)}</strong></td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: "bold", borderTop: "2px solid var(--border-color)" }}>
                  <td colSpan={3}>TOTAL</td>
                  <td className="text-right">{formatCurrency(trialBalance.grandTotalDebit)}</td>
                  <td className="text-right">{formatCurrency(trialBalance.grandTotalCredit)}</td>
                  <td className="text-right">
                    {Math.abs(trialBalance.grandTotalDebit - trialBalance.grandTotalCredit) < 0.01
                      ? "✅ BALANCED"
                      : `❌ Selisih: ${formatCurrency(trialBalance.grandTotalDebit - trialBalance.grandTotalCredit)}`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Income Statement */}
      {reportType === "income-statement" && incomeStatement && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(400px,1fr))] gap-5" style={{ gridTemplateColumns: "1fr" }}>
          <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-4 px-5 border-b border-default">
              <h2 className="text-[0.9375rem] font-semibold text-foreground">PENDAPATAN</h2>
              <span className="text-xl font-bold text-foreground text-success">{formatCurrency(incomeStatement.totalRevenue)}</span>
            </div>
            <div className="p-4 px-5">
              <table className="w-full border-collapse">
                <tbody>
                  {incomeStatement.revenues.map((r) => (
                    <tr key={r.code}>
                      <td className="font-mono">{r.code}</td>
                      <td>{r.name}</td>
                      <td className="text-right">{formatCurrency(r.amount)}</td>
                    </tr>
                  ))}
                  {incomeStatement.revenues.length === 0 && (
                    <tr><td colSpan={3} className="text-muted text-center">Belum ada data</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-4 px-5 border-b border-default">
              <h2 className="text-[0.9375rem] font-semibold text-foreground">BEBAN</h2>
              <span className="text-xl font-bold text-foreground text-danger">{formatCurrency(incomeStatement.totalExpense)}</span>
            </div>
            <div className="p-4 px-5">
              <table className="w-full border-collapse">
                <tbody>
                  {incomeStatement.expenses.map((e) => (
                    <tr key={e.code}>
                      <td className="font-mono">{e.code}</td>
                      <td>{e.name}</td>
                      <td className="text-right">{formatCurrency(e.amount)}</td>
                    </tr>
                  ))}
                  {incomeStatement.expenses.length === 0 && (
                    <tr><td colSpan={3} className="text-muted text-center">Belum ada data</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md" style={{ justifyContent: "center" }}>
            <div className="flex flex-col" style={{ alignItems: "center" }}>
              <span className="text-[0.8125rem] text-muted font-medium">LABA / RUGI BERSIH</span>
              <span className={`kpi-value ${incomeStatement.netIncome >= 0 ? "text-success" : "text-danger"}`}>
                {formatCurrency(incomeStatement.netIncome)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
