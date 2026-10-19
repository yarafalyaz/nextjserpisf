/**
 * Konteks opsi bersama halaman statement laba-rugi (standar + terealisasi/
 * tidak-terealisasi): periode dari path, opsi tampilan dari query/cookie,
 * dan kolom persen. Load data statement tetap per situs pemanggil karena
 * semantik status jurnalnya berbeda.
 *
 * Server-only: membaca cookie lewat `next/headers`.
 */

import { cookies } from "next/headers"

import { reportPeriodFromRoute, type ReportPeriod } from "@/lib/reports/report-period"
import {
  allStatementOptionParamNames,
  decodeStatementOptions,
  parseStatementOptions,
  STATEMENT_OPTIONS_COOKIE,
  type StatementDisplayOptions,
} from "@/lib/reports/statement-display"

export interface StatementOptionsContext {
  period: ReportPeriod
  options: StatementDisplayOptions
  showPercent: boolean
}

export async function loadStatementOptionsContext(
  routeParams: Promise<{ segments?: string[] }>,
  searchParams: Promise<Record<string, string | undefined>>,
): Promise<StatementOptionsContext> {
  const search = await searchParams

  // Periode dari path; tautan lama (?tanggalMulai=) tetap dihormati. Aturannya
  // hidup di satu tempat, `reportPeriodFromRoute`.
  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), 0, 1),
    end: now,
  }))

  const cookieStore = await cookies()
  const fromCookie = decodeStatementOptions(cookieStore.get(STATEMENT_OPTIONS_COOKIE)?.value)
  // An explicit query param (legacy share link) wins over the stored preference.
  const hasQueryOptions = allStatementOptionParamNames().some((name) => search[name] !== undefined)
  const options = hasQueryOptions ? parseStatementOptions(search) : fromCookie.options
  const showPercent =
    search.kolomPersen !== undefined ? search.kolomPersen === "1" : fromCookie.percentColumn

  return { period, options, showPercent }
}
