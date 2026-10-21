import { requirePermission } from "@/lib/auth/permissions"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { loadPayrollRows } from "@/lib/reports/payroll-reports-data"

export async function loadPayrollPageContext(
  routeParams: Promise<{ segments?: string[] }>,
  searchParams: Promise<Record<string, string | undefined>>,
) {
  // Data gaji/NPWP sensitif: wajib view_payroll_reports saja (fail-closed).
  // view_reports generik TIDAK cukup — pemegang hanya-view_reports ditolak.
  const user = await requirePermission("view_payroll_reports")

  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: now,
  }))

  const data = await loadPayrollRows(period)

  return { user, period, data }
}
