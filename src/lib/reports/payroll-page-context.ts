import { requireAnyPermission } from "@/lib/auth/permissions"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { loadPayrollRows } from "@/lib/reports/payroll-reports-data"

export async function loadPayrollPageContext(
  routeParams: Promise<{ segments?: string[] }>,
  searchParams: Promise<Record<string, string | undefined>>,
) {
  const user = await requireAnyPermission(["view_payroll_reports", "view_reports"])

  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: now,
  }))

  const data = await loadPayrollRows(period)

  return { user, period, data }
}
