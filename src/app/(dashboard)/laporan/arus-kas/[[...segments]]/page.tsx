export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import { sumEntriesByAccount } from "@/lib/services/report-aggregation.service";
import { formatAccounting, formatPeriod } from "@/lib/utils/format";
import { toLocalDateOnly } from "@/lib/utils/date-only";
import { ExportButtons } from "@/components/reports/export-buttons"
import { buildReportPdfHref } from "@/lib/reports/report-export";
import { StatementOptions } from "@/components/reports/statement-options";
import { ReportSheet } from "@/components/reports/report-sheet";
import {
  allStatementOptionParamNames,
  decodeStatementOptions,
  parseStatementOptions,
  STATEMENT_OPTIONS_COOKIE,
} from "@/lib/reports/statement-display";
import { reportPeriodFromRoute } from "@/lib/reports/report-period";
import {
  buildDirectCashFlow,
  classifyJournal,
  foldActivities,
} from "@/lib/finance/cash-flow"
import { buildReportHref } from "@/lib/reports/report-href";
import { safeAdd } from "@/lib/utils/math";

import type { Metadata } from "next";
import { ReportPageShell } from "@/components/reports/report-page-shell"

export const metadata: Metadata = { title: "Arus Kas" };

export default async function CashFlowPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("view_reports");
  const search = await searchParams;

  // Periode dari path; tautan lama (?tanggalMulai=) tetap dihormati. Aturannya
  // hidup di satu tempat, `reportPeriodFromRoute`.
  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: now,
  }));
  const startDate = period.start;
  const endDate = period.end;

  const cookieStore = await cookies();
  const fromCookie = decodeStatementOptions(cookieStore.get(STATEMENT_OPTIONS_COOKIE)?.value);
  const hasQueryOptions = allStatementOptionParamNames().some((name) => search[name] !== undefined);
  const options = hasQueryOptions ? parseStatementOptions(search) : fromCookie.options;

  // Identify cash/bank accounts.
  //
  // The old check OR-ed `code startsWith "1-1"` with a name match. The seeded
  // COA uses 4-digit codes (`1000 Kas & Bank`, `5500 Kas Kecil`) — no account
  // starts with "1-1" — so that clause matched nothing, while in a CUSTOMISED
  // COA a `1-1xx` code could well be a current asset like piutang, silently
  // pulling non-cash accounts into the cash-flow statement. We instead trust
  // the configured account MAPPINGS (the same source the payment/cash hooks
  // post against) plus a conservative type+name match, and always include the
  // configured Kas & Bank / Kas Kecil accounts even if renamed.
  const settings = await prisma.systemSetting.findFirst({
    select: { cashBankAccountId: true, pettyCashAccountId: true },
  });
  const configuredCashIds = [settings?.cashBankAccountId, settings?.pettyCashAccountId].filter(
    (id): id is number => typeof id === "number",
  );

  const cashAccounts = await prisma.account.findMany({
    where: {
      type: "ASSET",
      OR: [
        { id: { in: configuredCashIds.length ? configuredCashIds : [-1] } },
        { name: { contains: "Kas" } },
        { name: { contains: "Bank" } },
        { name: { contains: "Cash" } },
      ],
    },
    select: { id: true },
  });

  const cashAccountIds = cashAccounts.map((a) => a.id);
  const cashIdSet = new Set(cashAccountIds);

  const [entries, priorSums] = await Promise.all([
    prisma.journalEntry.findMany({
      where: {
        accountId: { in: cashAccountIds },
        journal: {
          status: { in: ["POSTED", "REVERSED"] },
          deletedAt: null,
          transactionDate: { gte: startDate, lte: endDate },
        },
      },
      include: { journal: true },
    }),
    // Saldo kas sebelum periode → dipakai untuk "Saldo Kas Awal".
    sumEntriesByAccount({ date: { lt: startDate } }),
  ]);

  let totalInflow = 0;
  let totalOutflow = 0;
  const monthlyData = new Map<string, { inflow: number; outflow: number }>();

  for (const entry of entries) {
    const debit = Number(entry.debit);
    const credit = Number(entry.credit);
    const date = entry.journal.transactionDate;
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    const bucket = monthlyData.get(monthKey) ?? { inflow: 0, outflow: 0 };
    bucket.inflow += debit;
    bucket.outflow += credit;
    monthlyData.set(monthKey, bucket);

    totalInflow += debit;
    totalOutflow += credit;
  }

  const netCashFlow = totalInflow - totalOutflow;
  const openingBalance = cashAccountIds.reduce(
    (sum, id) => sum + ((priorSums.get(id)?.debit ?? 0) - (priorSums.get(id)?.credit ?? 0)),
    0,
  );
  const closingBalance = openingBalance + netCashFlow;

  // Activity classification (dominant counterpart account) lives in a pure
  // helper so it is unit-tested — see lib/finance/cash-flow.ts.
  const journalIds = Array.from(new Set(entries.map((e) => e.journalId)));
  const fullJournals = journalIds.length
    ? await prisma.journal.findMany({
        where: { id: { in: journalIds } },
        include: { entries: { include: { account: true } } },
      })
    : [];

  const activity = foldActivities(
    fullJournals.map((j) =>
      classifyJournal(
        j.entries.map((e) => ({
          accountId: e.accountId,
          type: e.account?.type ?? "",
          code: e.account?.code ?? "",
          name: e.account?.name ?? "",
          debit: Number(e.debit),
          credit: Number(e.credit),
        })),
        (accountId) => cashIdSet.has(accountId),
      ),
    ),
  );

  // F-2026-10-20-46(b): metode langsung per akun lawan dari jurnal kas
  // yang sama (tanpa tagging baru); baris tertaut Buku Besar akun lawan.
  const directRows = buildDirectCashFlow(
    fullJournals.map((j) => ({
      entries: j.entries.map((e) => ({
        accountId: e.accountId,
        type: e.account?.type ?? "",
        code: e.account?.code ?? "",
        name: e.account?.name ?? "",
        slug: e.account?.slug ?? null,
        debit: Number(e.debit),
        credit: Number(e.credit),
      })),
    })),
    (accountId) => cashIdSet.has(accountId),
  );
  const directReceived = directRows.reduce((s, r) => safeAdd(s, r.received, 2), 0);
  const directPaid = directRows.reduce((s, r) => safeAdd(s, r.paid, 2), 0);
  const activityLabel: Record<string, string> = {
    operating: "Operasi",
    investing: "Investasi",
    financing: "Pendanaan",
  };

  const activityRows: { key: string; label: string; value: number }[] = [
    { key: "operating", label: "Arus Kas dari Aktivitas Operasi", value: activity.operating },
    { key: "investing", label: "Arus Kas dari Aktivitas Investasi", value: activity.investing },
    { key: "financing", label: "Arus Kas dari Aktivitas Pendanaan", value: activity.financing },
  ];

  const sortedMonths = Array.from(monthlyData.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const periodLabel = `Periode ${startDate.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })} – ${endDate.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`;
  const amount = (value: number) => formatAccounting(value, { zeroDash: false });

  return (
    <ReportPageShell title="Arus Kas" sheet={false} actions={<>
<div className="print:hidden flex flex-col gap-3">
        <StatementOptions
          basePath="/laporan/arus-kas"
          defaultStartDate={toLocalDateOnly(startDate)}
          defaultEndDate={toLocalDateOnly(endDate)}
          currentOptions={options}
        />
        <div className="flex items-center justify-end">
          <ExportButtons title="Arus Kas" pdfHref={buildReportPdfHref("arus-kas", period.slug)} />
        </div>
      </div>
</>}>




      <ReportSheet
        title="Laporan Arus Kas"
        subtitle="Per Aktivitas"
        periodLabel={periodLabel}
        periodCaption={`Periode ${startDate.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })} s/d ${endDate.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}`}
        printedBy={user.name ?? user.email}
        signatures={["Dibuat oleh", "Diperiksa oleh", "Disetujui oleh"]}
      >
        <table className="stmt" data-report-table="Arus Kas">
          <thead>
            <tr>
              <th>Deskripsi</th>
              <th className="num">{periodLabel.replace("Periode ", "")}</th>
            </tr>
          </thead>
          <tbody>
            {activityRows.map((row) => (
              <tr key={row.key}>
                <td className="indent-1">{row.label}</td>
                <td className="num">{amount(row.value)}</td>
              </tr>
            ))}
            <tr className="subtotal">
              <td>Kenaikan/(Penurunan) Kas Bersih</td>
              <td className="num">{amount(netCashFlow)}</td>
            </tr>
            <tr>
              <td className="indent-1">Saldo Kas Awal Periode</td>
              <td className="num">{amount(openingBalance)}</td>
            </tr>
            <tr className="grand">
              <td>Saldo Kas Akhir Periode</td>
              <td className="num">{amount(closingBalance)}</td>
            </tr>
          </tbody>
        </table>

        <div className="doc-head" style={{ marginTop: 24 }}>
          <div className="doc-title" style={{ fontSize: "10.5pt" }}>Metode Langsung — Penerimaan &amp; Pengeluaran per Akun Lawan</div>
        </div>
        <table className="stmt" data-report-table="Arus Kas Metode Langsung" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Akun Lawan</th>
              <th>Aktivitas</th>
              <th className="num">Diterima</th>
              <th className="num">Dibayar</th>
              <th className="num">Bersih</th>
            </tr>
          </thead>
          <tbody>
            {directRows.map((row) => (
              <tr key={row.accountId}>
                <td className="indent-1">
                  {row.slug ? (
                    <a href={buildReportHref("/laporan/buku-besar", period.slug, { akun: row.slug })}>{row.code} — {row.name}</a>
                  ) : (
                    <>{row.code} — {row.name}</>
                  )}
                </td>
                <td>{activityLabel[row.activity]}</td>
                <td className="num">{amount(row.received)}</td>
                <td className="num">{amount(row.paid)}</td>
                <td className="num">{amount(row.received - row.paid)}</td>
              </tr>
            ))}
            {directRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="stmt-empty">Tidak ada jurnal kas dengan akun lawan pada periode ini</td>
              </tr>
            ) : (
              <tr className="subtotal">
                <td>Total Metode Langsung</td>
                <td></td>
                <td className="num">{amount(directReceived)}</td>
                <td className="num">{amount(directPaid)}</td>
                <td className="num">{amount(directReceived - directPaid)}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="doc-head" style={{ marginTop: 24 }}>
          <div className="doc-title" style={{ fontSize: "10.5pt" }}>Rincian per Bulan</div>
        </div>
        <table className="stmt" data-report-table="Arus Kas per Bulan" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Bulan</th>
              <th className="num">Penerimaan</th>
              <th className="num">Pengeluaran</th>
              <th className="num">Arus Bersih</th>
            </tr>
          </thead>
          <tbody>
            {sortedMonths.map(([month, data]) => (
              <tr key={month}>
                <td className="indent-1">{formatPeriod(month)}</td>
                <td className="num">{amount(data.inflow)}</td>
                <td className="num">{amount(data.outflow)}</td>
                <td className="num">{amount(data.inflow - data.outflow)}</td>
              </tr>
            ))}
            {sortedMonths.length === 0 ? (
              <tr>
                <td colSpan={4} className="stmt-empty">Tidak ada mutasi kas pada periode ini</td>
              </tr>
            ) : (
              <tr className="subtotal">
                <td>Total</td>
                <td className="num">{amount(totalInflow)}</td>
                <td className="num">{amount(totalOutflow)}</td>
                <td className="num">{amount(netCashFlow)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </ReportSheet>
    </ReportPageShell>
  );
}
