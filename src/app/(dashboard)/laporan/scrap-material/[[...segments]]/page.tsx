export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import {
  reportPeriodFromRoute,
  formatPeriodLabel,
} from "@/lib/reports/report-period"
import { hasPermission } from "@/lib/auth/permissions"
import { SCRAP_REVIEW_STATUS_PENDING } from "@/lib/services/scrap-physical"
import {
  SCRAP_REASON_LABELS,
  isScrapReasonCode,
} from "@/lib/services/scrap-classification"
import { ScrapReviewQueue, type ScrapReviewQueueRow } from "@/components/reports/scrap-review-queue"
import { loadScrapMaterialReport } from "@/lib/reports/scrap-material-data"
import {
  buildScrapMaterialTable,
  scrapMaterialSummary,
} from "@/lib/reports/scrap-material"
import { buildReportPdfHref } from "@/lib/reports/report-export"

export const metadata: Metadata = { title: "Scrap Material" }

/**
 * Laporan scrap/yield per baris issue (F-2026-10-21-008). Angka dari loader
 * BOT 3 apa adanya; UI tidak hitung ulang. Flag dari SystemSetting dibaca
 * langsung (kontrak loader tidak membawanya).
 */
export default async function ScrapMaterialPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requirePermission("view_reports")

  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), 0, 1),
    end: now,
  }))

  const [{ report }, setting, canReview, pendingMi, pendingPo] = await Promise.all([
    loadScrapMaterialReport(period.start, period.end),
    prisma.systemSetting.findFirst({ select: { abnormalScrapPostingEnabled: true } }),
    hasPermission("complete_work_orders"),
    prisma.materialIssueItem.findMany({
      where: {
        scrapReviewStatus: SCRAP_REVIEW_STATUS_PENDING,
        materialIssue: { date: { gte: period.start, lte: period.end } },
      },
      select: {
        id: true,
        itemId: true,
        scrapReasonCode: true,
        scrapAbnormalQtySnapshot: true,
        scrapAbnormalValueSnapshot: true,
        materialIssue: { select: { documentNo: true, date: true } },
      },
      orderBy: { id: "asc" },
    }),
    prisma.productionOrderMaterial.findMany({
      where: {
        scrapReviewStatus: SCRAP_REVIEW_STATUS_PENDING,
        productionOrder: { createdAt: { gte: period.start, lte: period.end } },
      },
      select: {
        id: true,
        itemId: true,
        scrapReasonCode: true,
        scrapAbnormalQtySnapshot: true,
        scrapAbnormalValueSnapshot: true,
        productionOrder: { select: { documentNo: true, createdAt: true } },
      },
      orderBy: { id: "asc" },
    }),
  ])
  const pendingItemIds = [...new Set([...pendingMi.map((r) => r.itemId), ...pendingPo.map((r) => r.itemId)])]
  const pendingItems = pendingItemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: pendingItemIds } },
        select: { id: true, name: true, category: { select: { scrapAllowanceNote: true, materialShape: true } } },
      })
    : []
  const pendingItemById = new Map(pendingItems.map((i) => [i.id, i]))
  const reviewRows: ScrapReviewQueueRow[] = [
    ...pendingMi.map((r): ScrapReviewQueueRow => {
      const item = pendingItemById.get(r.itemId)
      return {
        source: "MI",
        lineId: r.id,
        documentNo: r.materialIssue.documentNo,
        date: r.materialIssue.date,
        itemName: item?.name ?? null,
        abnormalQty: Number(r.scrapAbnormalQtySnapshot ?? 0),
        abnormalValue: Number(r.scrapAbnormalValueSnapshot ?? 0),
        scrapReasonLabel: isScrapReasonCode(r.scrapReasonCode) ? SCRAP_REASON_LABELS[r.scrapReasonCode] : null,
        allowanceNote: item?.category?.scrapAllowanceNote ?? null,
        materialShape: item?.category?.materialShape ?? null,
      }
    }),
    ...pendingPo.map((r): ScrapReviewQueueRow => {
      const item = pendingItemById.get(r.itemId)
      return {
        source: "PO",
        lineId: r.id,
        documentNo: r.productionOrder.documentNo,
        date: r.productionOrder.createdAt,
        itemName: item?.name ?? null,
        abnormalQty: Number(r.scrapAbnormalQtySnapshot ?? 0),
        abnormalValue: Number(r.scrapAbnormalValueSnapshot ?? 0),
        scrapReasonLabel: isScrapReasonCode(r.scrapReasonCode) ? SCRAP_REASON_LABELS[r.scrapReasonCode] : null,
        allowanceNote: item?.category?.scrapAllowanceNote ?? null,
        materialShape: item?.category?.materialShape ?? null,
      }
    }),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const postingEnabled = setting?.abnormalScrapPostingEnabled ?? false
  const table = buildScrapMaterialTable(report)

  return (
    <ReportPageShell
      title="Scrap Material"
      sheetTitle="Scrap Material"
      subtitle="Scrap per Baris Issue — Normal vs Abnormal"
      periodLabel={formatPeriodLabel(period)}
      periodCaption={formatPeriodLabel(period)}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/scrap-material"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Scrap Material"
          pdfHref={buildReportPdfHref("scrap-material", period.slug)}
        />
      }
    >
      <ReportTableView columns={table.columns} rows={table.rows} tableLabel="Scrap Material" />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {scrapMaterialSummary(report, postingEnabled)}
      </p>
      <div className="print:hidden" style={{ marginTop: 16 }}>
        <ScrapReviewQueue rows={reviewRows} canReview={canReview} />
      </div>
    </ReportPageShell>
  )
}
