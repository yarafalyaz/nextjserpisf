/**
 * Loader laporan scrap material (F-2026-10-21-008). Satu sumber halaman+PDF.
 * Baca snapshot klasifikasi BEKU baris issue (MI terklasifikasi saat
 * complete, PO kumulatif saat issueMaterial) — dilarang hitung ulang dari
 * master BOM hidup. Filter periode pada tanggal dokumen issue.
 */
import { prisma } from "@/lib/db/prisma"
import {
  buildScrapMaterialReport,
  type ScrapReportLineInput,
  type ScrapReportResult,
} from "@/lib/reports/scrap-material"
import {
  SCRAP_REASON_LABELS,
  isScrapReasonCode,
} from "@/lib/services/scrap-classification"
import { PRODUCTION_ORDER_ABNORMAL_SCRAP_JOURNAL_REF_TYPE } from "@/lib/services/stock-journal.service"

export interface ScrapMaterialReport {
  report: ScrapReportResult
}

export async function loadScrapMaterialReport(start: Date, end: Date): Promise<ScrapMaterialReport> {
  const [miRows, poRows, journals] = await Promise.all([
    prisma.materialIssueItem.findMany({
      where: {
        scrapQty: { gt: 0 },
        materialIssue: { date: { gte: start, lte: end } },
      },
      select: {
        itemId: true, qty: true, scrapQty: true, scrapReasonCode: true,
        scrapPercentSnapshot: true, scrapPlannedQtySnapshot: true,
        scrapNormalQtySnapshot: true, scrapAbnormalQtySnapshot: true,
        scrapNormalValueSnapshot: true, scrapAbnormalValueSnapshot: true,
        materialIssue: { select: { documentNo: true, date: true } },
      },
    }),
    prisma.productionOrderMaterial.findMany({
      where: {
        scrapQty: { gt: 0 },
        productionOrder: { createdAt: { gte: start, lte: end } },
      },
      select: {
        itemId: true, actualQty: true, qty: true, scrapQty: true, scrapReasonCode: true,
        scrapPercentSnapshot: true,
        scrapNormalQtySnapshot: true, scrapAbnormalQtySnapshot: true,
        scrapNormalValueSnapshot: true, scrapAbnormalValueSnapshot: true,
        productionOrder: { select: { documentNo: true, createdAt: true } },
      },
    }),
    prisma.journal.findMany({
      where: {
        referenceType: PRODUCTION_ORDER_ABNORMAL_SCRAP_JOURNAL_REF_TYPE,
        transactionDate: { gte: start, lte: end },
        deletedAt: null,
      },
      select: { totalDebit: true },
    }),
  ])

  const itemIds = [...new Set([...miRows.map((r) => r.itemId), ...poRows.map((r) => r.itemId)])]
  const items = itemIds.length
    ? await prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true } })
    : []
  const itemNames = new Map(items.map((i) => [i.id, i.name]))

  const lines: ScrapReportLineInput[] = [
    ...miRows.map((r): ScrapReportLineInput => ({
      source: "MI",
      documentNo: r.materialIssue.documentNo,
      date: r.materialIssue.date,
      itemName: itemNames.get(r.itemId) ?? null,
      issueQty: Number(r.qty),
      plannedQty: r.scrapPlannedQtySnapshot != null ? Number(r.scrapPlannedQtySnapshot) : 0,
      scrapQty: Number(r.scrapQty),
      scrapReasonCode: r.scrapReasonCode,
      scrapReasonLabel: isScrapReasonCode(r.scrapReasonCode) ? SCRAP_REASON_LABELS[r.scrapReasonCode] : null,
      normalQty: Number(r.scrapNormalQtySnapshot ?? 0),
      abnormalQty: Number(r.scrapAbnormalQtySnapshot ?? 0),
      normalValue: Number(r.scrapNormalValueSnapshot ?? 0),
      abnormalValue: Number(r.scrapAbnormalValueSnapshot ?? 0),
      uncalibrated: r.scrapPercentSnapshot == null || Number(r.scrapPercentSnapshot) <= 0,
    })),
    ...poRows.map((r): ScrapReportLineInput => ({
      source: "PO",
      documentNo: r.productionOrder.documentNo,
      date: r.productionOrder.createdAt,
      itemName: itemNames.get(r.itemId) ?? null,
      issueQty: Number(r.actualQty ?? 0),
      plannedQty: Number(r.qty),
      scrapQty: Number(r.scrapQty),
      scrapReasonCode: r.scrapReasonCode,
      scrapReasonLabel: isScrapReasonCode(r.scrapReasonCode) ? SCRAP_REASON_LABELS[r.scrapReasonCode] : null,
      normalQty: Number(r.scrapNormalQtySnapshot ?? 0),
      abnormalQty: Number(r.scrapAbnormalQtySnapshot ?? 0),
      normalValue: Number(r.scrapNormalValueSnapshot ?? 0),
      abnormalValue: Number(r.scrapAbnormalValueSnapshot ?? 0),
      uncalibrated: r.scrapPercentSnapshot == null || Number(r.scrapPercentSnapshot) <= 0,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime())

  const abnormalJournalValue = journals.reduce((a, j) => a + Number(j.totalDebit), 0)
  return { report: buildScrapMaterialReport({ lines, abnormalJournalValue }) }
}
