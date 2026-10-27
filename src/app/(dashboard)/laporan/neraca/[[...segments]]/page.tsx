export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { requirePermission } from "@/lib/auth/permissions";
import { toLocalDateOnly } from "@/lib/utils/date-only";
import { ExportButtons } from "@/components/reports/export-buttons";
import { ReportPageShell } from "@/components/reports/report-page-shell";
import { StatementOptions } from "@/components/reports/statement-options";
import { StatementTableView } from "@/components/reports/statement-table-view";
import {
  allStatementOptionParamNames,
  decodeStatementOptions,
  parseStatementOptions,
  statementOptionsToParams,
  STATEMENT_OPTIONS_COOKIE,
} from "@/lib/reports/statement-display";
import { reportPeriodFromRoute } from "@/lib/reports/report-period";
import { loadBalanceSheetStatement } from "@/lib/reports/statement-data";
import { buildReportPdfHref } from "@/lib/reports/report-export";
import { serializeStatementCsv } from "@/lib/reports/statement-csv";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Neraca" };

export default async function BalanceSheetPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("view_reports");
  const search = await searchParams;

  // A balance sheet is a position "as of" a date, so the period slug resolves to
  // the END of whatever was picked: /laporan/neraca/2026-10 → per 31 Okt 2026.
  // Periode dibaca hanya via helper bersama; tautan lama ?tanggalMulai=&
  // tanggalSelesai= dihormati helper, dan ?date= (satu tanggal posisi)
  // dinormalisasi menjadi pasangan legacy satu hari di sini.
  const legacySearch = { ...search };
  if (!legacySearch.tanggalMulai && !legacySearch.tanggalSelesai && search.date) {
    legacySearch.tanggalMulai = search.date;
    legacySearch.tanggalSelesai = search.date;
  }
  const period = await reportPeriodFromRoute(routeParams, Promise.resolve(legacySearch), (now) => ({
    start: now,
    end: now,
  }));
  const asOfDate = new Date(period.end);

  const cookieStore = await cookies();
  const fromCookie = decodeStatementOptions(cookieStore.get(STATEMENT_OPTIONS_COOKIE)?.value);
  const hasQueryOptions = allStatementOptionParamNames().some((name) => search[name] !== undefined);
  const options = hasQueryOptions ? parseStatementOptions(search) : fromCookie.options;

  // Baris tabel disusun sekali di sini dan dipakai bersama layar + engine PDF.
  const statement = await loadBalanceSheetStatement(asOfDate, options, {
    basePath: "/laporan/buku-besar",
    periodSlug: period.slug,
  });

  return (
    <ReportPageShell
      title="Neraca"
      sheetTitle="Neraca (Standar)"
      subtitle="Laporan Posisi Keuangan"
      periodLabel={statement.periodLabel}
      periodCaption={statement.periodCaption}
      printedBy={user.name ?? user.email}
      filter={
        <StatementOptions
          basePath="/laporan/neraca"
          singleDate
          defaultStartDate={toLocalDateOnly(asOfDate)}
          defaultEndDate={toLocalDateOnly(asOfDate)}
          currentOptions={options}
        />
      }
      actions={
        <ExportButtons
          title="Neraca"
          pdfHref={buildReportPdfHref("neraca", period.slug, statementOptionsToParams(options))}
          csvData={serializeStatementCsv("Neraca", statement.table)}
        />
      }
    >
      <StatementTableView table={statement.table} tableLabel="Neraca" />
    </ReportPageShell>
  );
}
