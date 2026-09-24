export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import { formatCurrency } from "@/lib/utils/format";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";
import { ExportButtons } from "@/components/reports/export-buttons";
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
  DetailTableFoot,
  DetailTableFootRow,
} from "@/components/ui/detail-table";
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration";
import { FormSelect } from "@/components/ui/form-select";
import { Label } from "@/components/ui/shadcn/label";
import { Button } from "@/components/ui/button";
import { AppDatePicker } from "@/components/ui/date-picker";

import type { Metadata } from "next";
import { toLocalDateOnly } from "@/lib/utils/date-only"

export const metadata: Metadata = { title: "Keuangan" };

async function getTrialBalanceData(tanggalMulai?: string, tanggalSelesai?: string) {
  const _s = tanggalMulai ? new Date(tanggalMulai) : new Date(new Date().getFullYear(), 0, 1);
  const _e = tanggalSelesai ? new Date(tanggalSelesai) : new Date();
  const start = Number.isNaN(_s.getTime()) ? new Date(new Date().getFullYear(), 0, 1) : _s;
  const end = Number.isNaN(_e.getTime()) ? new Date() : _e;
  end.setHours(23, 59, 59, 999);

  const entries = await prisma.journalEntry.findMany({
    where: {
      journal: { status: { in: ["POSTED", "REVERSED"] }, transactionDate: { gte: start, lte: end } },
    },
    include: { account: true },
  });

  const accountBalances = new Map<number, { code: string; name: string; type: string; totalDebit: number; totalCredit: number }>();
  for (const entry of entries) {
    const existing = accountBalances.get(entry.accountId) || { code: entry.account.code, name: entry.account.name, type: entry.account.type, totalDebit: 0, totalCredit: 0 };
    existing.totalDebit += Number(entry.debit);
    existing.totalCredit += Number(entry.credit);
    accountBalances.set(entry.accountId, existing);
  }
  const accounts = Array.from(accountBalances.values()).sort((a, b) => a.code.localeCompare(b.code));
  const grandTotalDebit = accounts.reduce((sum, a) => sum + a.totalDebit, 0);
  const grandTotalCredit = accounts.reduce((sum, a) => sum + a.totalCredit, 0);
  return { accounts, grandTotalDebit, grandTotalCredit };
}

async function getIncomeStatementData(tanggalMulai?: string, tanggalSelesai?: string) {
  const _s = tanggalMulai ? new Date(tanggalMulai) : new Date(new Date().getFullYear(), 0, 1);
  const _e = tanggalSelesai ? new Date(tanggalSelesai) : new Date();
  const start = Number.isNaN(_s.getTime()) ? new Date(new Date().getFullYear(), 0, 1) : _s;
  const end = Number.isNaN(_e.getTime()) ? new Date() : _e;
  end.setHours(23, 59, 59, 999);

  const entries = await prisma.journalEntry.findMany({
    where: {
      journal: { status: { in: ["POSTED", "REVERSED"] }, transactionDate: { gte: start, lte: end } },
      account: { type: { in: ["REVENUE", "EXPENSE"] } },
    },
    include: { account: true },
  });

  const accountMap = new Map<number, { code: string; name: string; type: string; amount: number }>();
  for (const entry of entries) {
    const existing = accountMap.get(entry.accountId) || { code: entry.account.code, name: entry.account.name, type: entry.account.type, amount: 0 };
    if (entry.account.type === "REVENUE") existing.amount += Number(entry.credit) - Number(entry.debit);
    else existing.amount += Number(entry.debit) - Number(entry.credit);
    accountMap.set(entry.accountId, existing);
  }
  const revenues: { code: string; name: string; amount: number }[] = [];
  const expenses: { code: string; name: string; amount: number }[] = [];
  for (const [, acc] of accountMap) {
    if (acc.type === "REVENUE") revenues.push(acc);
    else expenses.push(acc);
  }
  revenues.sort((a, b) => a.code.localeCompare(b.code));
  expenses.sort((a, b) => a.code.localeCompare(b.code));
  const totalRevenue = revenues.reduce((sum, r) => sum + r.amount, 0);
  const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netIncome = totalRevenue - totalExpense;
  return { revenues, expenses, totalRevenue, totalExpense, netIncome };
}

export default async function FinancialReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string; tanggalMulai?: string; tanggalSelesai?: string }>;
}) {
  await requirePermission("view_reports");
  const params = await searchParams;
  const reportType = params.report || "trial-balance";

  const trialBalance = reportType === "trial-balance" ? await getTrialBalanceData(params.tanggalMulai, params.tanggalSelesai) : null;
  const incomeStatement = reportType === "income-statement" ? await getIncomeStatementData(params.tanggalMulai, params.tanggalSelesai) : null;

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Laporan", href: "/laporan" }, { label: "Keuangan" }]} />
      <div className="flex items-center justify-between flex-wrap gap-4 print:hidden">
        <h1 className="text-2xl font-bold text-foreground">
          {reportType === "trial-balance" ? "Neraca Saldo" : "Laba Rugi"}
        </h1>
        <ExportButtons title="Keuangan" />
      </div>

      <form className="bg-surface rounded-xl border border-default shadow-sm p-5 flex gap-4 flex-wrap items-end print:hidden" action="/laporan/keuangan">
        <div className="flex flex-col gap-1.5 w-[200px]">
          <Label htmlFor="report">Jenis Laporan</Label>
          <FormSelect id="report" name="report" defaultValue={reportType} placeholder="Pilih Laporan"
            options={[
              { value: "trial-balance", label: "Neraca Saldo" },
              { value: "income-statement", label: "Laba Rugi" },
            ]} />
        </div>
        <AppDatePicker label="Dari" name="tanggalMulai" defaultValue={params.tanggalMulai || `${new Date().getFullYear()}-01-01`} className="w-[180px]" />
        <AppDatePicker label="Sampai" name="tanggalSelesai" defaultValue={params.tanggalSelesai || toLocalDateOnly(new Date())} className="w-[180px]" />
        <Button type="submit" variant="primary" size="sm">Tampilkan</Button>
      </form>

      {reportType === "trial-balance" && trialBalance && (
        <ReportSection title="Neraca Saldo">
          <DetailTable data-report-table="Neraca Saldo">
            <DetailTableHead>
              <DetailTableTh>Kode</DetailTableTh><DetailTableTh>Nama Akun</DetailTableTh><DetailTableTh>Tipe</DetailTableTh>
              <DetailTableTh align="right">Debit</DetailTableTh><DetailTableTh align="right">Kredit</DetailTableTh><DetailTableTh align="right">Saldo</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {trialBalance.accounts.length === 0 ? (
                <DetailTableRow><DetailTableTd colSpan={6} className="text-center py-10 text-muted-foreground">Belum ada data journal</DetailTableTd></DetailTableRow>
              ) : (
                trialBalance.accounts.map((acc) => (
                  <DetailTableRow key={acc.code}>
                    <DetailTableTd className="font-mono">{acc.code}</DetailTableTd>
                    <DetailTableTd>{acc.name}</DetailTableTd>
                    <DetailTableTd>{acc.type}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(acc.totalDebit)}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(acc.totalCredit)}</DetailTableTd>
                    <DetailTableTd align="right" className="font-bold">{formatCurrency(acc.totalDebit - acc.totalCredit)}</DetailTableTd>
                  </DetailTableRow>
                ))
              )}
            </DetailTableBody>
            <DetailTableFoot>
              <DetailTableFootRow className="font-bold border-t-2 border-default">
                <DetailTableTd colSpan={3}>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{formatCurrency(trialBalance.grandTotalDebit)}</DetailTableTd>
                <DetailTableTd align="right">{formatCurrency(trialBalance.grandTotalCredit)}</DetailTableTd>
                <DetailTableTd align="right">
                  {Math.abs(trialBalance.grandTotalDebit - trialBalance.grandTotalCredit) < 0.01
                    ? "SEIMBANG"
                    : `Selisih: ${formatCurrency(trialBalance.grandTotalDebit - trialBalance.grandTotalCredit)}`}
                </DetailTableTd>
              </DetailTableFootRow>
            </DetailTableFoot>
          </DetailTable>
        </ReportSection>
      )}

      {reportType === "income-statement" && incomeStatement && (
        <>
          <ReportSection title="Pendapatan">
            <DetailTable data-report-table="Pendapatan">
              <DetailTableHead><DetailTableTh>Kode</DetailTableTh><DetailTableTh>Nama Akun</DetailTableTh><DetailTableTh align="right">Jumlah</DetailTableTh></DetailTableHead>
              <DetailTableBody>
                {incomeStatement.revenues.map((r) => (
                  <DetailTableRow key={r.code}>
                    <DetailTableTd className="font-mono">{r.code}</DetailTableTd>
                    <DetailTableTd>{r.name}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(r.amount)}</DetailTableTd>
                  </DetailTableRow>
                ))}
                {incomeStatement.revenues.length === 0 && (
                  <DetailTableRow><DetailTableTd colSpan={3} className="text-muted-foreground text-center">Belum ada data</DetailTableTd></DetailTableRow>
                )}
              </DetailTableBody>
            </DetailTable>
          </ReportSection>

          <ReportSection title="Beban">
            <DetailTable data-report-table="Beban">
              <DetailTableHead><DetailTableTh>Kode</DetailTableTh><DetailTableTh>Nama Akun</DetailTableTh><DetailTableTh align="right">Jumlah</DetailTableTh></DetailTableHead>
              <DetailTableBody>
                {incomeStatement.expenses.map((e) => (
                  <DetailTableRow key={e.code}>
                    <DetailTableTd className="font-mono">{e.code}</DetailTableTd>
                    <DetailTableTd>{e.name}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(e.amount)}</DetailTableTd>
                  </DetailTableRow>
                ))}
                {incomeStatement.expenses.length === 0 && (
                  <DetailTableRow><DetailTableTd colSpan={3} className="text-muted-foreground text-center">Belum ada data</DetailTableTd></DetailTableRow>
                )}
              </DetailTableBody>
            </DetailTable>
          </ReportSection>

          <div className={`report-section ${incomeStatement.netIncome >= 0 ? 'border-success' : 'border-danger'}`} style={{ borderLeft: '4px solid', paddingLeft: 16 }}>
            <div className="flex items-center gap-4">
              <span className="text-sm font-bold">LABA / RUGI BERSIH</span>
              <span className={`text-base font-bold ${incomeStatement.netIncome >= 0 ? 'text-success' : 'text-danger'}`}>
                {formatCurrency(incomeStatement.netIncome)}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
