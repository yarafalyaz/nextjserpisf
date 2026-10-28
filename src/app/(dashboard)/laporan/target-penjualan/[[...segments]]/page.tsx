export const dynamic = "force-dynamic"

import { formatDate } from "@/lib/utils/format"
import type { Metadata } from "next"

import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { SalesTargetAchievementCard } from "@/components/reports/sales-target-achievement-card"
import { SalesTargetReconciliationCard } from "@/components/reports/sales-target-reconciliation-card"
import { SalesTargetManagePanel } from "@/components/reports/sales-target-manage-panel"
import { hasPermission, requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { getSalesTargetAchievementReport } from "@/actions/sales-target.actions"
import {
  getSalesTargetPeriodReconciliation,
  listSalesTargets,
} from "@/lib/reports/sales-target-achievement-data"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { toLocalDateOnly } from "@/lib/utils/date-only"

export const metadata: Metadata = { title: "Target vs Pencapaian Penjualan" }

export default async function SalesTargetPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ tanggalMulai?: string; tanggalSelesai?: string }>
}) {
  await requirePermission("view_reports")
  const canManage = await hasPermission("approve_sales_invoices")

  const { start: startDate, end: endDate } = await reportPeriodFromRoute(
    routeParams,
    searchParams,
    (now) => ({
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: now,
    }),
  )
  endDate.setHours(23, 59, 59, 999)

  const [report, reconciliation, targets, employees] = await Promise.all([
    getSalesTargetAchievementReport({ start: startDate, end: endDate }),
    getSalesTargetPeriodReconciliation({ start: startDate, end: endDate }),
    canManage ? listSalesTargets() : Promise.resolve([]),
    canManage
      ? prisma.employee.findMany({
          where: { isActive: true, deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ])

  const periodLabel = `Periode ${formatDate(startDate)} – ${formatDate(endDate)}`

  return (
    <ReportPageShell
      title="Target vs Pencapaian Penjualan"
      sheetTitle="Target vs Pencapaian Penjualan"
      periodLabel={periodLabel}
      periodCaption={periodLabel}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/target-penjualan"
          mode="range"
          defaultStartDate={toLocalDateOnly(startDate)}
          defaultEndDate={toLocalDateOnly(endDate)}
        />
      }
      actions={<ExportButtons title="Target_vs_Pencapaian_Penjualan" />}
    >
      <div className="flex flex-col gap-6">
        <SalesTargetAchievementCard report={report} />
        <SalesTargetReconciliationCard reconciliation={reconciliation} report={report} />
        {canManage ? (
          <SalesTargetManagePanel
            targets={targets.map((t) => ({
              id: t.id,
              salesEmployeeId: t.salesEmployeeId,
              salesEmployeeName: t.salesEmployee.name,
              periodStart: t.periodStart,
              periodEnd: t.periodEnd,
              targetAmount: Number(t.targetAmount),
              notes: t.notes,
            }))}
            employees={employees}
            canManage={canManage}
          />
        ) : null}
      </div>
    </ReportPageShell>
  )
}
