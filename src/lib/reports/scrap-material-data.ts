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
import { SCRAP_REVIEW_STATUS_PENDING } from "@/lib/services/scrap-physical"

export interface ScrapMaterialReport {
  report: ScrapReportResult
}

/** Baris antrean tinjau scrap abnormal — bentuk sama dengan yang dikonsumsi komponen antrean. */
export interface ScrapReviewQueueLine {
  source: "MI" | "PO"
  lineId: number
  documentNo: string
  date: Date
  itemName: string | null
  abnormalQty: number
  abnormalValue: number
  scrapReasonLabel: string | null
  allowanceNote: string | null
  materialShape: string | null
}

/**
 * Antrean tinjau abnormal periode (dipindah dari page laporan agar page
 * tidak baca Prisma langsung). Angka snapshot beku apa adanya, urut tanggal.
 */
export async function loadScrapReviewQueue(start: Date, end: Date): Promise<ScrapReviewQueueLine[]> {
  const pendingSelect = {
    id: true,
    itemId: true,
    scrapReasonCode: true,
    scrapAbnormalQtySnapshot: true,
    scrapAbnormalValueSnapshot: true,
  } as const
  const [pendingMi, pendingPo] = await Promise.all([
    prisma.materialIssueItem.findMany({
      where: {
        scrapReviewStatus: SCRAP_REVIEW_STATUS_PENDING,
        materialIssue: { date: { gte: start, lte: end } },
      },
      select: { ...pendingSelect, materialIssue: { select: { documentNo: true, date: true } } },
      orderBy: { id: "asc" },
    }),
    prisma.productionOrderMaterial.findMany({
      where: {
        scrapReviewStatus: SCRAP_REVIEW_STATUS_PENDING,
        productionOrder: { createdAt: { gte: start, lte: end } },
      },
      select: { ...pendingSelect, productionOrder: { select: { documentNo: true, createdAt: true } } },
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
  type PendingRow = {
    id: number
    itemId: number
    scrapReasonCode: string | null
    scrapAbnormalQtySnapshot: unknown
    scrapAbnormalValueSnapshot: unknown
  }
  const toLine = (
    source: ScrapReviewQueueLine["source"],
    r: PendingRow,
    doc: { documentNo: string; date: Date },
  ): ScrapReviewQueueLine => {
    const item = pendingItemById.get(r.itemId)
    return {
      source,
      lineId: r.id,
      documentNo: doc.documentNo,
      date: doc.date,
      itemName: item?.name ?? null,
      abnormalQty: Number(r.scrapAbnormalQtySnapshot ?? 0),
      abnormalValue: Number(r.scrapAbnormalValueSnapshot ?? 0),
      scrapReasonLabel: isScrapReasonCode(r.scrapReasonCode) ? SCRAP_REASON_LABELS[r.scrapReasonCode] : null,
      allowanceNote: item?.category?.scrapAllowanceNote ?? null,
      materialShape: item?.category?.materialShape ?? null,
    }
  }
  const rows: ScrapReviewQueueLine[] = [
    ...pendingMi.map((r) => toLine("MI", r, r.materialIssue)),
    ...pendingPo.map((r) => toLine("PO", r, { documentNo: r.productionOrder.documentNo, date: r.productionOrder.createdAt })),
  ]
  return rows.sort((a, b) => a.date.getTime() - b.date.getTime())
}

export async function loadScrapMaterialReport(start: Date, end: Date): Promise<ScrapMaterialReport> {
  const [miRows, poRows, journals, remnants] = await Promise.all([
    prisma.materialIssueItem.findMany({
      where: {
        scrapQty: { gt: 0 },
        materialIssue: { date: { gte: start, lte: end } },
      },
      select: {
        id: true,
        itemId: true, qty: true, scrapQty: true, scrapReasonCode: true,
        scrapPercentSnapshot: true, scrapPlannedQtySnapshot: true,
        scrapNormalQtySnapshot: true, scrapAbnormalQtySnapshot: true,
        scrapNormalValueSnapshot: true, scrapAbnormalValueSnapshot: true,
        scrapReviewStatus: true, scrapReviewDisposition: true,
        materialIssue: { select: { documentNo: true, date: true } },
      },
    }),
    prisma.productionOrderMaterial.findMany({
      where: {
        scrapQty: { gt: 0 },
        productionOrder: { createdAt: { gte: start, lte: end } },
      },
      select: {
        id: true,
        itemId: true, actualQty: true, qty: true, scrapQty: true, scrapReasonCode: true,
        scrapPercentSnapshot: true,
        scrapNormalQtySnapshot: true, scrapAbnormalQtySnapshot: true,
        scrapNormalValueSnapshot: true, scrapAbnormalValueSnapshot: true,
        scrapReviewStatus: true, scrapReviewDisposition: true,
        productionOrder: { select: { documentNo: true, createdAt: true } },
      },
    }),
    // Tetap POSTED-saja (TASK-022): terfilter referenceType scrap; jurnal
    // lawan reversal ber-referenceType "Journal" tersaring keluar, jadi
    // pasangan reversal satu tingkat neto nol. Tanpa filter status, jurnal
    // asli REVERSED terhitung penuh tanpa lawannya.
    prisma.journal.findMany({
      where: {
        referenceType: PRODUCTION_ORDER_ABNORMAL_SCRAP_JOURNAL_REF_TYPE,
        status: "POSTED",
        transactionDate: { gte: start, lte: end },
        deletedAt: null,
      },
      select: { totalDebit: true },
    }),
    prisma.remnant.findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: { sourceType: true, sourceId: true, qty: true, status: true, scrapWeightKg: true },
    }),
  ])

  const itemIds = [...new Set([...miRows.map((r) => r.itemId), ...poRows.map((r) => r.itemId)])]
  const items = itemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, name: true, category: { select: { scrapAllowanceNote: true, materialShape: true } } },
      })
    : []
  const itemNames = new Map(items.map((i) => [i.id, i.name]))
  const allowanceNotes = new Map(
    items.map((i) => [i.id, (i as { category?: { scrapAllowanceNote?: string | null } | null }).category?.scrapAllowanceNote ?? null]),
  )
  const materialShapes = new Map(
    items.map((i) => [i.id, (i as { category?: { materialShape?: string | null } | null }).category?.materialShape ?? null]),
  )
  // Agregasi remnant per baris issue asal: usable -> remnantQty, scrap -> kg.
  const remnantBySource = new Map<string, { remnantQty: number; scrapWeightKg: number }>()
  for (const r of remnants) {
    if (!r.sourceType || r.sourceId == null) continue
    const key = `${r.sourceType}:${r.sourceId}`
    const cur = remnantBySource.get(key) ?? { remnantQty: 0, scrapWeightKg: 0 }
    if (r.status === "usable" || r.status === "consumed") cur.remnantQty += Number(r.qty)
    if (r.status === "scrap") cur.scrapWeightKg += Number(r.scrapWeightKg ?? 0)
    remnantBySource.set(key, cur)
  }

  // installedQty sengaja null di kedua jalur (keputusan t_4c0eebfc):
  // BR-SCRAP-07 masih USULAN dan schema tidak punya qty terpasang fabrikasi
  // per baris (InstalledPart = sparepart kendaraan, domain lain).
  // Rekonsiliasi tidak dinilai daripada ditebak issue-scrap-remnant;
  // nyalakan hanya bila sumber terpasang eksplisit per baris tersedia.
  type SnapshotRow = {
    id: number
    itemId: number
    scrapQty: unknown
    scrapReasonCode: string | null
    scrapPercentSnapshot: unknown
    scrapNormalQtySnapshot: unknown
    scrapAbnormalQtySnapshot: unknown
    scrapNormalValueSnapshot: unknown
    scrapAbnormalValueSnapshot: unknown
    scrapReviewStatus: string | null
    scrapReviewDisposition: string | null
  }
  const toReportLine = (
    source: ScrapReportLineInput["source"],
    r: SnapshotRow,
    doc: { documentNo: string; date: Date },
    qty: { issueQty: number; plannedQty: number },
    aggKey: string,
  ): ScrapReportLineInput => {
    const agg = remnantBySource.get(aggKey) ?? { remnantQty: 0, scrapWeightKg: 0 }
    return {
      source,
      documentNo: doc.documentNo,
      date: doc.date,
      itemName: itemNames.get(r.itemId) ?? null,
      issueQty: qty.issueQty,
      plannedQty: qty.plannedQty,
      scrapQty: Number(r.scrapQty),
      scrapReasonCode: r.scrapReasonCode,
      scrapReasonLabel: isScrapReasonCode(r.scrapReasonCode) ? SCRAP_REASON_LABELS[r.scrapReasonCode] : null,
      normalQty: Number(r.scrapNormalQtySnapshot ?? 0),
      abnormalQty: Number(r.scrapAbnormalQtySnapshot ?? 0),
      normalValue: Number(r.scrapNormalValueSnapshot ?? 0),
      abnormalValue: Number(r.scrapAbnormalValueSnapshot ?? 0),
      uncalibrated: r.scrapPercentSnapshot == null || Number(r.scrapPercentSnapshot) <= 0,
      reviewStatus: r.scrapReviewStatus ?? null,
      reviewDisposition: r.scrapReviewDisposition ?? null,
      remnantQty: agg.remnantQty,
      installedQty: null,
      scrapWeightKg: agg.scrapWeightKg,
      allowanceNote: allowanceNotes.get(r.itemId) ?? null,
      materialShape: materialShapes.get(r.itemId) ?? null,
    }
  }
  const lines: ScrapReportLineInput[] = [
    ...miRows.map((r) =>
      toReportLine(
        "MI",
        r,
        r.materialIssue,
        {
          issueQty: Number(r.qty),
          plannedQty: r.scrapPlannedQtySnapshot != null ? Number(r.scrapPlannedQtySnapshot) : 0,
        },
        `material_issue_item:${r.id}`,
      ),
    ),
    ...poRows.map((r) =>
      toReportLine(
        "PO",
        r,
        { documentNo: r.productionOrder.documentNo, date: r.productionOrder.createdAt },
        { issueQty: Number(r.actualQty ?? 0), plannedQty: Number(r.qty) },
        `production_order_material:${r.id}`,
      ),
    ),
  ].sort((a, b) => a.date.getTime() - b.date.getTime())

  const abnormalJournalValue = journals.reduce((a, j) => a + Number(j.totalDebit), 0)
  return { report: buildScrapMaterialReport({ lines, abnormalJournalValue }) }
}
