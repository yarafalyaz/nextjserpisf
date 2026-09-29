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
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section";
import { ReportNarration } from "@/components/reports/report-narration";

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
  const cashIdSet = new Set(cashAccountIds);

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
    existing.inflow += debit;
    existing.outflow += credit;
    totalInflow += debit;
    totalOutflow += credit;
    monthlyData.set(monthKey, existing);
  }

  const netCashFlow = totalInflow - totalOutflow;

  // Activity classification
  const journalIds = Array.from(new Set(entries.map((e) => e.journalId)));
  const fullJournals = journalIds.length
    ? await prisma.journal.findMany({
        where: { id: { in: journalIds } },
        include: { entries: { include: { account: true } } },
      })
    : [];

  function classifyCounterpart(acc: { type: string; code: string; name: string }): "operating" | "investing" | "financing" {
    const code = acc.code || "";
    const name = (acc.name || "").toLowerCase();
    if (acc.type === "EQUITY") return "financing";
    if (acc.type === "ASSET") {
      if (code.startsWith("1-3") || code.startsWith("13") || name.includes("aset tetap") || name.includes("tetap"))
        return "investing";
      return "operating";
    }
    if (acc.type === "LIABILITY") {
      if (name.includes("pinjaman") || name.includes("hutang bank") || name.includes("loan") || name.includes("modal"))
        return "financing";
      return "operating";
    }
    return "operating";
  }

  const activity = { operating: 0, investing: 0, financing: 0 };
  for (const j of fullJournals) {
    let cashDelta = 0;
    const counterparts: { type: string; code: string; name: string; weight: number }[] = [];
    for (const e of j.entries) {
      const d = Number(e.debit);
      const c = Number(e.credit);
      if (cashIdSet.has(e.accountId)) {
        cashDelta += d - c;
      } else if (e.account) {
        counterparts.push({ type: e.account.type, code: e.account.code, name: e.account.name, weight: Math.abs(d - c) });
      }
    }
    if (cashDelta === 0 || counterparts.length === 0) continue;
    const dominant = counterparts.reduce((a, b) => (b.weight > a.weight ? b : a));
    activity[classifyCounterpart(dominant)] += cashDelta;
  }
  const activityRows: { key: string; label: string; value: number }[] = [
    { key: "operating", label: "Aktivitas Operasi", value: activity.operating },
    { key: "investing", label: "Aktivitas Investasi", value: activity.investing },
    { key: "financing", label: "Aktivitas Pendanaan", value: activity.financing },
  ];

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

      <ReportLetterhead
        title="Laporan Arus Kas"
        subtitle="Cash Flow"
        periodLabel={periodLabel}
      />

      {/* KPI Summary (screen only) */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Total Penerimaan Kas" value={formatCurrency(totalInflow)} />
        <ReportKpiCard label="Total Pengeluaran Kas" value={formatCurrency(totalOutflow)} />
        <ReportKpiCard
          label="Arus Kas Bersih"
          value={formatCurrency(netCashFlow)}
          valueClassName={netCashFlow >= 0 ? "text-success" : "text-danger"}
        />
      </div>

      {/* Cash Accounts */}
      <ReportSection title="Akun Kas/Bank">
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
      </ReportSection>

      {/* Cash flow by activity */}
      <ReportSection title="Arus Kas per Aktivitas" description="Klasifikasi otomatis berdasarkan tipe akun lawan tiap transaksi kas">
        <DetailTable data-report-table="Arus Kas per Aktivitas">
          <DetailTableHead>
            <DetailTableTh>Aktivitas</DetailTableTh>
            <DetailTableTh align="right">Arus Kas Bersih (Rp)</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {activityRows.map((row) => (
              <DetailTableRow key={row.key}>
                <DetailTableTd>{row.label}</DetailTableTd>
                <DetailTableTd
                  align="right"
                  className={row.value >= 0 ? "text-success" : "text-danger"}
                >
                  {formatAccounting(row.value)}
                </DetailTableTd>
              </DetailTableRow>
            ))}
            <DetailTableRow className="font-bold border-t-2 border-default">
              <DetailTableTd>Kenaikan/(Penurunan) Kas Bersih</DetailTableTd>
              <DetailTableTd align="right">
                {formatAccounting(activity.operating + activity.investing + activity.financing)}
              </DetailTableTd>
            </DetailTableRow>
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

      {/* Monthly Breakdown */}
      <ReportSection title="Arus Kas per Bulan">
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
                <DetailTableTd align="right">{formatAccounting(data.inflow)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(data.outflow)}</DetailTableTd>
                <DetailTableTd
                  align="right"
                  className={data.inflow - data.outflow >= 0 ? "text-success" : "text-danger"}
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
                <DetailTableTd align="right">{formatAccounting(totalInflow)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalOutflow)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(netCashFlow)}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
    </div>
  );
}
