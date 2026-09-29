export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import { formatCurrency, formatAccounting } from "@/lib/utils/format";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";
import { ExportButtons } from "@/components/reports/export-buttons";
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table";
import { ReportDateFilter } from "@/components/reports/report-date-filter";
import { ReportLetterhead } from "@/components/reports/report-letterhead";
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Pusat Laba" };

export default async function ProfitCenterIncomePage({
  searchParams,
}: {
  searchParams: Promise<{ tanggalMulai?: string; tanggalSelesai?: string }>;
}) {
  await requirePermission("view_reports");
  const params = await searchParams;

  const now = new Date();
  const _sd = params.tanggalMulai ? new Date(params.tanggalMulai) : new Date(now.getFullYear(), 0, 1);
  const _ed = params.tanggalSelesai ? new Date(params.tanggalSelesai) : now;
  const startDate = Number.isNaN(_sd.getTime()) ? new Date(now.getFullYear(), 0, 1) : _sd;
  const endDate = Number.isNaN(_ed.getTime()) ? new Date(now) : _ed;
  endDate.setHours(23, 59, 59, 999);

  const [profitCenters, revenueEntries, expenseEntries] = await Promise.all([
    prisma.profitCenter.findMany({ orderBy: { code: "asc" } }),
    prisma.journalEntry.findMany({
      where: { account: { type: "REVENUE" }, journal: { status: { in: ["POSTED", "REVERSED"] }, transactionDate: { gte: startDate, lte: endDate } } },
      include: { account: true },
    }),
    prisma.journalEntry.findMany({
      where: { account: { type: "EXPENSE" }, journal: { status: { in: ["POSTED", "REVERSED"] }, transactionDate: { gte: startDate, lte: endDate } } },
      include: { account: true },
    }),
  ]);

  const revenueByAccount = new Map<number, { code: string; name: string; amount: number }>();
  for (const entry of revenueEntries) {
    const existing = revenueByAccount.get(entry.accountId) || { code: entry.account.code, name: entry.account.name, amount: 0 };
    existing.amount += Number(entry.credit) - Number(entry.debit);
    revenueByAccount.set(entry.accountId, existing);
  }

  const expenseByAccount = new Map<number, { code: string; name: string; amount: number }>();
  for (const entry of expenseEntries) {
    const existing = expenseByAccount.get(entry.accountId) || { code: entry.account.code, name: entry.account.name, amount: 0 };
    existing.amount += Number(entry.debit) - Number(entry.credit);
    expenseByAccount.set(entry.accountId, existing);
  }

  const revenueItems = Array.from(revenueByAccount.values()).filter((r) => r.amount !== 0).sort((a, b) => a.code.localeCompare(b.code));
  const expenseItems = Array.from(expenseByAccount.values()).filter((e) => e.amount !== 0).sort((a, b) => a.code.localeCompare(b.code));
  const totalRevenue = revenueItems.reduce((sum, r) => sum + r.amount, 0);
  const totalExpense = expenseItems.reduce((sum, e) => sum + e.amount, 0);
  const netIncome = totalRevenue - totalExpense;

  const periodLabel = `Periode ${startDate.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })} – ${endDate.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Laporan", href: "/laporan" }, { label: "Pusat Laba" }]} />
      </div>
      <div className="flex items-center justify-end print:hidden"><ExportButtons title="Pusat_Laba" /></div>
      <div className="print:hidden">
        <ReportDateFilter defaultStartDate={startDate.toISOString().split("T")[0]} defaultEndDate={endDate.toISOString().split("T")[0]} />
      </div>
      <ReportLetterhead title="Laporan Laba Rugi per Pusat Laba" periodLabel={periodLabel} />
      <ReportNarration text="Laporan Pusat Laba mengukur kontribusi laba dari setiap divisi, departemen, atau unit bisnis dalam perusahaan. Analisis ini membantu dalam evaluasi kinerja, alokasi sumber daya, dan pengambilan keputusan strategis di tingkat unit." />

      <ReportSection title="Daftar Pusat Laba">
        <DetailTable data-report-table="Daftar Pusat Laba">
          <DetailTableHead>
            <DetailTableTh>Kode</DetailTableTh><DetailTableTh>Nama</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {profitCenters.map((pc) => (
              <DetailTableRow key={pc.id}>
                <DetailTableTd>{pc.code}</DetailTableTd><DetailTableTd>{pc.name}</DetailTableTd>
              </DetailTableRow>
            ))}
            {profitCenters.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={2} className="text-center">Belum ada pusat laba</DetailTableTd></DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Total Pendapatan" value={formatCurrency(totalRevenue)} valueClassName="text-success" />
        <ReportKpiCard label="Total Beban" value={formatCurrency(totalExpense)} valueClassName="text-danger" />
        <ReportKpiCard label="Laba (Rugi) Bersih" value={formatCurrency(netIncome)} valueClassName={netIncome >= 0 ? 'text-success' : 'text-danger'} />
      </div>

      <ReportSection title="Pendapatan">
        <DetailTable data-report-table="Pendapatan">
          <DetailTableHead>
            <DetailTableTh>Kode</DetailTableTh><DetailTableTh>Nama Akun</DetailTableTh><DetailTableTh align="right">Jumlah</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {revenueItems.map((r) => (
              <DetailTableRow key={r.code}>
                <DetailTableTd>{r.code}</DetailTableTd><DetailTableTd>{r.name}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(r.amount)}</DetailTableTd>
              </DetailTableRow>
            ))}
            {revenueItems.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={3} className="text-center">Tidak ada data pendapatan</DetailTableTd></DetailTableRow>
            )}
            <DetailTableRow className="font-bold border-t-2 border-default">
              <DetailTableTd colSpan={2}>Total Pendapatan</DetailTableTd>
              <DetailTableTd align="right">{formatAccounting(totalRevenue)}</DetailTableTd>
            </DetailTableRow>
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

      <ReportSection title="Beban">
        <DetailTable data-report-table="Beban">
          <DetailTableHead>
            <DetailTableTh>Kode</DetailTableTh><DetailTableTh>Nama Akun</DetailTableTh><DetailTableTh align="right">Jumlah</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {expenseItems.map((e) => (
              <DetailTableRow key={e.code}>
                <DetailTableTd>{e.code}</DetailTableTd><DetailTableTd>{e.name}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(e.amount)}</DetailTableTd>
              </DetailTableRow>
            ))}
            {expenseItems.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={3} className="text-center">Tidak ada data beban</DetailTableTd></DetailTableRow>
            )}
            <DetailTableRow className="font-bold border-t-2 border-default">
              <DetailTableTd colSpan={2}>Total Beban</DetailTableTd>
              <DetailTableTd align="right">{formatAccounting(totalExpense)}</DetailTableTd>
            </DetailTableRow>
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

      <div className={`report-section ${netIncome >= 0 ? 'border-success' : 'border-danger'}`} style={{ borderLeft: '4px solid', paddingLeft: 16 }}>
        <div className="flex items-center gap-4">
          <span className="text-sm font-bold">Laba (Rugi) Bersih Keseluruhan</span>
          <span className={`text-base font-bold ${netIncome >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrency(netIncome)}</span>
        </div>
      </div>
    </div>
  );
}
