export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import { formatCurrency, formatAccounting } from "@/lib/utils/format";
import { toLocalDateOnly } from "@/lib/utils/date-only";
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

  // Aggregate in SQL, grouped by profit center + account type, so we never pull
  // the whole ledger into Node. Only POSTED/REVERSED journals count (a reversal
  // is its own POSTED journal, so the pair nets to zero).
  const [profitCenters, grouped] = await Promise.all([
    prisma.profitCenter.findMany({ orderBy: { code: "asc" } }),
    prisma.journalEntry.groupBy({
      by: ["profitCenterId", "accountId"],
      where: {
        journal: { status: { in: ["POSTED", "REVERSED"] }, transactionDate: { gte: startDate, lte: endDate } },
        account: { type: { in: ["REVENUE", "EXPENSE"] } },
      },
      _sum: { debit: true, credit: true },
    }),
  ]);

  // Resolve the accounts referenced so we can classify REVENUE vs EXPENSE.
  const accountIds = [...new Set(grouped.map((g) => g.accountId))];
  const accounts = accountIds.length
    ? await prisma.account.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, code: true, name: true, type: true },
      })
    : [];
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  // Roll up per profit center (null profitCenterId = "Tanpa Pusat Laba").
  type Bucket = {
    key: number;
    code: string;
    name: string;
    revenueByAccount: Map<number, { code: string; name: string; amount: number }>;
    expenseByAccount: Map<number, { code: string; name: string; amount: number }>;
    totalRevenue: number;
    totalExpense: number;
  };

  const buckets = new Map<number, Bucket>();
  const bucketKey = (pcId: number | null) => pcId ?? 0;

  const getBucket = (pcId: number | null): Bucket => {
    const key = bucketKey(pcId);
    let bucket = buckets.get(key);
    if (!bucket) {
      const pc = pcId != null ? profitCenters.find((p) => p.id === pcId) : null;
      bucket = {
        key,
        code: pc?.code ?? "-",
        name: pc?.name ?? "Tanpa Pusat Laba",
        revenueByAccount: new Map(),
        expenseByAccount: new Map(),
        totalRevenue: 0,
        totalExpense: 0,
      };
      buckets.set(key, bucket);
    }
    return bucket;
  };

  for (const row of grouped) {
    const account = accountMap.get(row.accountId);
    if (!account) continue;
    const debit = Number(row._sum.debit ?? 0);
    const credit = Number(row._sum.credit ?? 0);
    const bucket = getBucket(row.profitCenterId);

    if (account.type === "REVENUE") {
      const amount = credit - debit;
      if (amount === 0) continue;
      const existing = bucket.revenueByAccount.get(account.id) ?? { code: account.code, name: account.name, amount: 0 };
      existing.amount += amount;
      bucket.revenueByAccount.set(account.id, existing);
      bucket.totalRevenue += amount;
    } else {
      const amount = debit - credit;
      if (amount === 0) continue;
      const existing = bucket.expenseByAccount.get(account.id) ?? { code: account.code, name: account.name, amount: 0 };
      existing.amount += amount;
      bucket.expenseByAccount.set(account.id, existing);
      bucket.totalExpense += amount;
    }
  }

  const rows = [...buckets.values()]
    .map((b) => ({
      key: b.key,
      code: b.code,
      name: b.name,
      totalRevenue: b.totalRevenue,
      totalExpense: b.totalExpense,
      netIncome: b.totalRevenue - b.totalExpense,
      revenueItems: [...b.revenueByAccount.values()].filter((r) => r.amount !== 0).sort((a, c) => a.code.localeCompare(c.code)),
      expenseItems: [...b.expenseByAccount.values()].filter((e) => e.amount !== 0).sort((a, c) => a.code.localeCompare(c.code)),
    }))
    .filter((r) => r.totalRevenue !== 0 || r.totalExpense !== 0)
    .sort((a, b) => a.code.localeCompare(b.code));

  const totalRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);
  const totalExpense = rows.reduce((s, r) => s + r.totalExpense, 0);
  const netIncome = totalRevenue - totalExpense;

  const periodLabel = `Periode ${startDate.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })} – ${endDate.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Laporan", href: "/laporan" }, { label: "Pusat Laba" }]} />
      </div>
      <div className="flex items-center justify-end print:hidden"><ExportButtons title="Pusat_Laba" /></div>
      <div className="print:hidden">
        <ReportDateFilter defaultStartDate={toLocalDateOnly(startDate)} defaultEndDate={toLocalDateOnly(endDate)} />
      </div>
      <ReportLetterhead title="Laporan Laba Rugi per Pusat Laba" periodLabel={periodLabel} />
      <ReportNarration text="Laporan Pusat Laba mengukur kontribusi laba dari setiap divisi, departemen, atau unit bisnis dalam perusahaan. Analisis ini membantu dalam evaluasi kinerja, alokasi sumber daya, dan pengambilan keputusan strategis di tingkat unit." />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Total Pendapatan" value={formatCurrency(totalRevenue)} valueClassName="text-success" />
        <ReportKpiCard label="Total Beban" value={formatCurrency(totalExpense)} valueClassName="text-danger" />
        <ReportKpiCard label="Laba (Rugi) Bersih" value={formatCurrency(netIncome)} valueClassName={netIncome >= 0 ? 'text-success' : 'text-danger'} />
      </div>

      <ReportSection title="Ringkasan per Pusat Laba">
        <DetailTable data-report-table="Ringkasan Pusat Laba">
          <DetailTableHead>
            <DetailTableTh>Kode</DetailTableTh>
            <DetailTableTh>Pusat Laba</DetailTableTh>
            <DetailTableTh align="right">Pendapatan</DetailTableTh>
            <DetailTableTh align="right">Beban</DetailTableTh>
            <DetailTableTh align="right">Laba (Rugi)</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((r) => (
              <DetailTableRow key={r.key}>
                <DetailTableTd className="font-mono">{r.code}</DetailTableTd>
                <DetailTableTd>{r.name}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(r.totalRevenue)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(r.totalExpense)}</DetailTableTd>
                <DetailTableTd align="right" className={r.netIncome >= 0 ? "text-success font-medium" : "text-danger font-medium"}>{formatAccounting(r.netIncome)}</DetailTableTd>
              </DetailTableRow>
            ))}
            {rows.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={5} className="text-center text-muted-foreground py-6">Tidak ada transaksi pendapatan/beban pada periode ini</DetailTableTd></DetailTableRow>
            )}
            {rows.length > 0 && (
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd colSpan={2}>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalRevenue)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalExpense)}</DetailTableTd>
                <DetailTableTd align="right" className={netIncome >= 0 ? "text-success" : "text-danger"}>{formatAccounting(netIncome)}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

      {/* Per-profit-center detail (accounts behind each number). */}
      {rows.map((r) => (
        <ReportSection key={r.key} title={`${r.code} — ${r.name}`}>
          <DetailTable data-report-table={`Pusat Laba ${r.code}`}>
            <DetailTableHead>
              <DetailTableTh>Kode Akun</DetailTableTh>
              <DetailTableTh>Nama Akun</DetailTableTh>
              <DetailTableTh align="right">Jumlah</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {r.revenueItems.map((item) => (
                <DetailTableRow key={`rev-${item.code}`}>
                  <DetailTableTd className="font-mono">{item.code}</DetailTableTd>
                  <DetailTableTd>{item.name}</DetailTableTd>
                  <DetailTableTd align="right" className="text-success">{formatAccounting(item.amount)}</DetailTableTd>
                </DetailTableRow>
              ))}
              {r.expenseItems.map((item) => (
                <DetailTableRow key={`exp-${item.code}`}>
                  <DetailTableTd className="font-mono">{item.code}</DetailTableTd>
                  <DetailTableTd>{item.name}</DetailTableTd>
                  <DetailTableTd align="right" className="text-danger">{formatAccounting(item.amount)}</DetailTableTd>
                </DetailTableRow>
              ))}
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd colSpan={2}>Laba (Rugi) {r.name}</DetailTableTd>
                <DetailTableTd align="right" className={r.netIncome >= 0 ? "text-success" : "text-danger"}>{formatAccounting(r.netIncome)}</DetailTableTd>
              </DetailTableRow>
            </DetailTableBody>
          </DetailTable>
        </ReportSection>
      ))}
    </div>
  );
}
