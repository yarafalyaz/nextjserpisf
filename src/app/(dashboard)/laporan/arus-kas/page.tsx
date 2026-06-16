export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import {
  formatCurrency,
  formatAccounting,
  formatPeriod,
} from "@/lib/utils/format";
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

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Arus Kas" };

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ tanggalMulai?: string; tanggalSelesai?: string }>;
}) {
  await requirePermission("view_reports");
  const params = await searchParams;

  const now = new Date();
  const _sd = params.tanggalMulai
    ? new Date(params.tanggalMulai)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const _ed = params.tanggalSelesai ? new Date(params.tanggalSelesai) : now;
  const startDate = Number.isNaN(_sd.getTime())
    ? new Date(now.getFullYear(), now.getMonth(), 1)
    : _sd;
  const endDate = Number.isNaN(_ed.getTime()) ? new Date(now) : _ed;
  endDate.setHours(23, 59, 59, 999);

  // Get all cash/bank accounts
  const cashAccounts = await prisma.account.findMany({
    where: {
      type: "ASSET",
      OR: [
        { code: { startsWith: "1-1" } },
        { name: { contains: "kas" } },
        { name: { contains: "bank" } },
        { name: { contains: "cash" } },
      ],
    },
  });

  const cashAccountIds = cashAccounts.map((a) => a.id);

  // Get journal entries for these accounts within date range
  const entries = await prisma.journalEntry.findMany({
    where: {
      accountId: { in: cashAccountIds },
      journal: {
        status: { in: ["POSTED", "REVERSED"] },
        transactionDate: { gte: startDate, lte: endDate },
      },
    },
    include: { journal: true, account: true },
    orderBy: { journal: { transactionDate: "desc" } },
  });

  // Calculate totals
  let totalInflow = 0;
  let totalOutflow = 0;

  // Group by month
  const monthlyData = new Map<string, { inflow: number; outflow: number }>();

  for (const entry of entries) {
    const debit = Number(entry.debit);
    const credit = Number(entry.credit);
    const date = entry.journal.transactionDate;
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    const existing = monthlyData.get(monthKey) || { inflow: 0, outflow: 0 };

    // Debit to cash = inflow, Credit from cash = outflow
    existing.inflow += debit;
    existing.outflow += credit;
    totalInflow += debit;
    totalOutflow += credit;

    monthlyData.set(monthKey, existing);
  }

  const netCashFlow = totalInflow - totalOutflow;

  const sortedMonths = Array.from(monthlyData.entries()).sort((a, b) =>
    b[0].localeCompare(a[0]),
  );

  const periodLabel = `Periode ${startDate.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })} – ${endDate.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs
          items={[
            { label: "Dasbor", href: "/" },
            { label: "Laporan", href: "/laporan" },
            { label: "Arus Kas" },
          ]}
        />
      </div>

      <div className="flex items-center justify-end print:hidden">
        <ExportButtons title="Arus Kas" />
      </div>

      <div className="print:hidden">
        <ReportDateFilter
          defaultStartDate={startDate.toISOString().split("T")[0]}
          defaultEndDate={endDate.toISOString().split("T")[0]}
        />
      </div>

      {/* Professional letterhead (screen + print) */}
      <ReportLetterhead
        title="Laporan Arus Kas"
        subtitle="Cash Flow"
        periodLabel={periodLabel}
      />

      {/* KPI Summary (screen only) */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-6 print:hidden">
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-xl font-bold text-success">
            {formatCurrency(totalInflow)}
          </div>
          <div className="text-[0.8125rem] text-muted-foreground font-medium">
            Total Penerimaan Kas
          </div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="text-xl font-bold text-danger">
            {formatCurrency(totalOutflow)}
          </div>
          <div className="text-[0.8125rem] text-muted-foreground font-medium">
            Total Pengeluaran Kas
          </div>
        </div>
        <div className="bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border border-default transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div
            className={`text-xl font-bold ${netCashFlow >= 0 ? "text-success" : "text-danger"}`}
          >
            {formatCurrency(netCashFlow)}
          </div>
          <div className="text-[0.8125rem] text-muted-foreground font-medium">
            Arus Kas Bersih
          </div>
        </div>
      </div>

      {/* Cash Accounts */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden mb-6 no-break">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">
            Akun Kas/Bank
          </h2>
        </div>
        <div className="p-4 px-5">
          <DetailTable data-report-table="Akun Kas/Bank">
            <DetailTableHead>
              <DetailTableTh>Kode</DetailTableTh>
              <DetailTableTh>Nama Akun</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {cashAccounts.map((acc) => (
                <DetailTableRow key={acc.id}>
                  <DetailTableTd>{acc.code}</DetailTableTd>
                  <DetailTableTd>{acc.name}</DetailTableTd>
                </DetailTableRow>
              ))}
              {cashAccounts.length === 0 && (
                <DetailTableRow>
                  <DetailTableTd colSpan={2} className="text-center">
                    Tidak ada akun kas/bank ditemukan
                  </DetailTableTd>
                </DetailTableRow>
              )}
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>

      {/* Monthly Breakdown */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">
            Arus Kas per Bulan
          </h2>
        </div>
        <div className="p-4 px-5">
          <div className="overflow-x-auto">
            <DetailTable data-report-table="Arus Kas per Bulan">
              <DetailTableHead>
                <DetailTableTh>Bulan</DetailTableTh>
                <DetailTableTh align="right">Penerimaan (Rp)</DetailTableTh>
                <DetailTableTh align="right">Pengeluaran (Rp)</DetailTableTh>
                <DetailTableTh align="right">Arus Bersih (Rp)</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {sortedMonths.map(([month, data]) => (
                  <DetailTableRow key={month}>
                    <DetailTableTd>{formatPeriod(month)}</DetailTableTd>
                    <DetailTableTd align="right">
                      {formatAccounting(data.inflow)}
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      {formatAccounting(data.outflow)}
                    </DetailTableTd>
                    <DetailTableTd
                      align="right"
                      className={
                        data.inflow - data.outflow >= 0
                          ? "text-success"
                          : "text-danger"
                      }
                    >
                      {formatAccounting(data.inflow - data.outflow)}
                    </DetailTableTd>
                  </DetailTableRow>
                ))}
                {sortedMonths.length === 0 && (
                  <DetailTableRow>
                    <DetailTableTd colSpan={4} className="text-center">
                      Tidak ada data arus kas pada periode ini
                    </DetailTableTd>
                  </DetailTableRow>
                )}
                {sortedMonths.length > 0 && (
                  <DetailTableRow className="font-bold border-t-2 border-default">
                    <DetailTableTd>Total</DetailTableTd>
                    <DetailTableTd align="right">
                      {formatAccounting(totalInflow)}
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      {formatAccounting(totalOutflow)}
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      {formatAccounting(netCashFlow)}
                    </DetailTableTd>
                  </DetailTableRow>
                )}
              </DetailTableBody>
            </DetailTable>
          </div>
        </div>
      </div>
    </div>
  );
}
