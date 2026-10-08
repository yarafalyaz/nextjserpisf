export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { sumEntriesByAccount } from "@/lib/services/report-aggregation.service";
import { computeIncomeStatement } from "@/lib/finance/income-statement";
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

  // Totalled in SQL (groupBy) rather than pulling every journal line of the
  // period into Node just to add up two columns.
  const periodSums = await sumEntriesByAccount({ date: { gte: start, lte: end } });

  const accounts = await prisma.account.findMany({
    where: { id: { in: [...periodSums.keys()] } },
    select: { id: true, code: true, name: true, type: true },
  });
  const rows = accounts
    .map((acc) => {
      const sums = periodSums.get(acc.id) ?? { debit: 0, credit: 0 };
      return { code: acc.code, name: acc.name, type: acc.type, totalDebit: sums.debit, totalCredit: sums.credit };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  const grandTotalDebit = rows.reduce((sum, a) => sum + a.totalDebit, 0);
  const grandTotalCredit = rows.reduce((sum, a) => sum + a.totalCredit, 0);
  return { accounts: rows, grandTotalDebit, grandTotalCredit };
}

async function getIncomeStatementData(tanggalMulai?: string, tanggalSelesai?: string) {
  const _s = tanggalMulai ? new Date(tanggalMulai) : new Date(new Date().getFullYear(), 0, 1);
  const _e = tanggalSelesai ? new Date(tanggalSelesai) : new Date();
  const start = Number.isNaN(_s.getTime()) ? new Date(new Date().getFullYear(), 0, 1) : _s;
  const end = Number.isNaN(_e.getTime()) ? new Date() : _e;
  end.setHours(23, 59, 59, 999);

  const [accounts, periodSums] = await Promise.all([
    prisma.account.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, type: true },
      orderBy: { code: "asc" },
    }),
    sumEntriesByAccount({ date: { gte: start, lte: end } }),
  ]);

  // Delegate to the SAME multi-step engine the dedicated Laba Rugi report uses.
  // The old inline sum lumped every EXPENSE account (including 5-1 HPP) into one
  // "Beban" bucket and never carved out 8- (other income) / 9- (other expense),
  // so this legacy page reported a different net profit than /laporan/laba-rugi
  // for the same period whenever those accounts existed.
  return computeIncomeStatement(
    accounts.map((acc) => ({
      id: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type,
      debit: periodSums.get(acc.id)?.debit ?? 0,
      credit: periodSums.get(acc.id)?.credit ?? 0,
    })),
  );
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
          <ReportSection title="Pendapatan Usaha">
            <DetailTable data-report-table="Pendapatan">
              <DetailTableHead><DetailTableTh>Kode</DetailTableTh><DetailTableTh>Nama Akun</DetailTableTh><DetailTableTh align="right">Jumlah</DetailTableTh></DetailTableHead>
              <DetailTableBody>
                {incomeStatement.revenueData.map((r) => (
                  <DetailTableRow key={r.code}>
                    <DetailTableTd className="font-mono">{r.code}</DetailTableTd>
                    <DetailTableTd>{r.name}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(r.balance)}</DetailTableTd>
                  </DetailTableRow>
                ))}
                {incomeStatement.revenueData.length === 0 && (
                  <DetailTableRow><DetailTableTd colSpan={3} className="text-muted-foreground text-center">Belum ada data</DetailTableTd></DetailTableRow>
                )}
              </DetailTableBody>
              <DetailTableFoot>
                <DetailTableFootRow className="font-semibold">
                  <DetailTableTd colSpan={2}>Total Pendapatan Usaha</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(incomeStatement.totalRevenue)}</DetailTableTd>
                </DetailTableFootRow>
              </DetailTableFoot>
            </DetailTable>
          </ReportSection>

          {incomeStatement.cogsData.length > 0 && (
            <ReportSection title="Harga Pokok Penjualan (HPP)">
              <DetailTable data-report-table="HPP">
                <DetailTableHead><DetailTableTh>Kode</DetailTableTh><DetailTableTh>Nama Akun</DetailTableTh><DetailTableTh align="right">Jumlah</DetailTableTh></DetailTableHead>
                <DetailTableBody>
                  {incomeStatement.cogsData.map((c) => (
                    <DetailTableRow key={c.code}>
                      <DetailTableTd className="font-mono">{c.code}</DetailTableTd>
                      <DetailTableTd>{c.name}</DetailTableTd>
                      <DetailTableTd align="right">{formatCurrency(c.balance)}</DetailTableTd>
                    </DetailTableRow>
                  ))}
                </DetailTableBody>
                <DetailTableFoot>
                  <DetailTableFootRow className="font-semibold">
                    <DetailTableTd colSpan={2}>Total HPP</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(incomeStatement.totalCogs)}</DetailTableTd>
                  </DetailTableFootRow>
                </DetailTableFoot>
              </DetailTable>
            </ReportSection>
          )}

          <div className={`report-section ${incomeStatement.grossProfit >= 0 ? 'border-success' : 'border-danger'}`} style={{ borderLeft: '4px solid', paddingLeft: 16 }}>
            <div className="flex items-center gap-4">
              <span className="text-sm font-bold">LABA KOTOR</span>
              <span className={`text-base font-bold ${incomeStatement.grossProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                {formatCurrency(incomeStatement.grossProfit)}
              </span>
            </div>
          </div>

          <ReportSection title="Beban Operasional">
            <DetailTable data-report-table="Beban Operasional">
              <DetailTableHead><DetailTableTh>Kode</DetailTableTh><DetailTableTh>Nama Akun</DetailTableTh><DetailTableTh align="right">Jumlah</DetailTableTh></DetailTableHead>
              <DetailTableBody>
                {incomeStatement.expenseData.map((e) => (
                  <DetailTableRow key={e.code}>
                    <DetailTableTd className="font-mono">{e.code}</DetailTableTd>
                    <DetailTableTd>{e.name}</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(e.balance)}</DetailTableTd>
                  </DetailTableRow>
                ))}
                {incomeStatement.expenseData.length === 0 && (
                  <DetailTableRow><DetailTableTd colSpan={3} className="text-muted-foreground text-center">Belum ada data</DetailTableTd></DetailTableRow>
                )}
              </DetailTableBody>
              <DetailTableFoot>
                <DetailTableFootRow className="font-semibold">
                  <DetailTableTd colSpan={2}>Total Beban Operasional</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(incomeStatement.totalExpense)}</DetailTableTd>
                </DetailTableFootRow>
              </DetailTableFoot>
            </DetailTable>
          </ReportSection>

          {(incomeStatement.otherIncomeData.length > 0 || incomeStatement.otherExpenseData.length > 0) && (
            <ReportSection title="Pendapatan / Beban Lain-lain">
              <DetailTable data-report-table="Lain-lain">
                <DetailTableHead><DetailTableTh>Kode</DetailTableTh><DetailTableTh>Nama Akun</DetailTableTh><DetailTableTh align="right">Jumlah</DetailTableTh></DetailTableHead>
                <DetailTableBody>
                  {incomeStatement.otherIncomeData.map((o) => (
                    <DetailTableRow key={o.code}>
                      <DetailTableTd className="font-mono">{o.code}</DetailTableTd>
                      <DetailTableTd>{o.name}</DetailTableTd>
                      <DetailTableTd align="right">{formatCurrency(o.balance)}</DetailTableTd>
                    </DetailTableRow>
                  ))}
                  {incomeStatement.otherExpenseData.map((o) => (
                    <DetailTableRow key={o.code}>
                      <DetailTableTd className="font-mono">{o.code}</DetailTableTd>
                      <DetailTableTd>{o.name}</DetailTableTd>
                      <DetailTableTd align="right">{formatCurrency(-o.balance)}</DetailTableTd>
                    </DetailTableRow>
                  ))}
                </DetailTableBody>
                <DetailTableFoot>
                  <DetailTableFootRow className="font-semibold">
                    <DetailTableTd colSpan={2}>Total Lain-lain</DetailTableTd>
                    <DetailTableTd align="right">{formatCurrency(incomeStatement.totalOther)}</DetailTableTd>
                  </DetailTableFootRow>
                </DetailTableFoot>
              </DetailTable>
            </ReportSection>
          )}

          <div className={`report-section ${incomeStatement.netProfit >= 0 ? 'border-success' : 'border-danger'}`} style={{ borderLeft: '4px solid', paddingLeft: 16 }}>
            <div className="flex items-center gap-4">
              <span className="text-sm font-bold">LABA / RUGI BERSIH</span>
              <span className={`text-base font-bold ${incomeStatement.netProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                {formatCurrency(incomeStatement.netProfit)}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
