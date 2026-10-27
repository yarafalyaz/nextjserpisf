export const dynamic = "force-dynamic"

import { cookies } from "next/headers"
import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportTableView } from "@/components/reports/report-table-view"
import { StatementOptions } from "@/components/reports/statement-options"
import {
  allStatementOptionParamNames,
  decodeStatementOptions,
  parseStatementOptions,
  STATEMENT_OPTIONS_COOKIE,
} from "@/lib/reports/statement-display"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { parseReportFilters } from "@/lib/reports/report-href"
import { loadTrialBalanceReport } from "@/lib/reports/trial-balance-data"
import { buildReportPdfHref } from "@/lib/reports/report-export"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Neraca Saldo" }

export default async function TrialBalancePage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requirePermission("view_reports")
  const [params, search] = await Promise.all([routeParams, searchParams])

  // Neraca saldo adalah posisi "per" tanggal: slug periode berarti akhir
  // periode. Periode dibaca hanya via helper bersama supaya tautan lama
  // ?tanggalMulai=&tanggalSelesai= tetap menampilkan posisi yang diminta.
  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: now,
    end: now,
  }))
  const asOfDate = new Date(period.end)

  const cookieStore = await cookies()
  const fromCookie = decodeStatementOptions(cookieStore.get(STATEMENT_OPTIONS_COOKIE)?.value)
  const hasQueryOptions = allStatementOptionParamNames().some((name) => search[name] !== undefined)
  const options = hasQueryOptions ? parseStatementOptions(search) : fromCookie.options

  // Tanggal pembanding kini bagian dari path (`/pembanding/2026-09-30`); param
  // query lama tetap dibaca supaya tautan sebelum perpindahan tidak jadi tautan mati.
  const compareValue = parseReportFilters(params.segments?.slice(1) ?? []).pembanding ?? search.pembanding
  // Akhir hari penuh (.999) sama dengan layar & registry PDF — jurnal pukul
  // 23:59:59.500 tidak boleh hilang dari salah satu sisi (B9).
  const compareRaw = compareValue ? new Date(`${compareValue}T23:59:59.999`) : null
  const compareDate = compareRaw && !Number.isNaN(compareRaw.getTime()) ? compareRaw : null

  // Baris tabel disusun sekali di sini dan dipakai bersama layar + engine PDF.
  const report = await loadTrialBalanceReport(asOfDate, compareDate)

  return (
    <ReportPageShell
      title="Neraca Saldo"
      sheetTitle="Neraca Saldo"
      subtitle="Daftar Saldo per Akun"
      periodLabel={report.periodLabel}
      periodCaption={report.periodCaption}
      printedBy={user.name ?? user.email}
      filter={
        <StatementOptions
          basePath="/laporan/neraca-saldo"
          singleDate
          defaultStartDate={toLocalDateOnly(asOfDate)}
          defaultEndDate={toLocalDateOnly(asOfDate)}
          currentOptions={options}
          extraDate={{ param: "pembanding", label: "Bandingkan dengan tanggal (opsional)", value: compareValue ?? "" }}
          filters={{ pembanding: compareValue }}
        />
      }
      actions={
        <ExportButtons
          title="Neraca Saldo"
          pdfHref={buildReportPdfHref("neraca-saldo", period.slug, {
            ...(compareValue ? { pembanding: compareValue } : {}),
          })}
        />
      }
    >
      <ReportTableView
        columns={report.table.columns}
        rows={report.table.rows}
        tableLabel="Neraca Saldo"
      />
    </ReportPageShell>
  )
}
