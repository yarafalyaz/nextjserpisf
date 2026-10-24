/**
 * Laporan scrap material produksi (F-2026-10-21-008).
 *
 * Memakai snapshot klasifikasi beku dari baris issue (MI + PO), BUKAN
 * master BOM hidup. Aturan putusan flag Lead + turunan BOT 6 PR #504:
 * - Baris unplanned (planned 0): rate per baris null (qty absolut saja);
 *   rate hanya agregat penyebut total qty issue.
 * - Abnormal tampil temuan laporan meski jurnal P2(b) nol (flag OFF) —
 *   selisih vs jurnal ditampilkan, bukan nol diam-diam (S8).
 * - allowance null/0 = belum kalibrasi: baris temuan kalibrasi.
 * Pure (tanpa Prisma/DOM).
 */

export interface ScrapReportLineInput {
  source: "MI" | "PO"
  documentNo: string
  date: Date
  itemName: string | null
  issueQty: number
  plannedQty: number
  scrapQty: number
  scrapReasonCode: string | null
  scrapReasonLabel: string | null
  normalQty: number
  abnormalQty: number
  normalValue: number
  abnormalValue: number
  uncalibrated: boolean
  // F-2026-10-24-098-S: field opsional — pemanggil lama tanpa field ini
  // berperilaku persis lama (reviewStatus null, rekonsiliasi tidak dinilai).
  reviewStatus?: string | null
  reviewDisposition?: string | null
  /** Qty remnant usable tertaut baris ini (satuan issue). */
  remnantQty?: number
  /** Qty terpasang eksplisit; null = tidak dinilai rekonsiliasinya. */
  installedQty?: number | null
  /** Berat besi tua (kg) dari remnant scrap tertaut baris ini. */
  scrapWeightKg?: number
  /** Teks acuan allowance kategori item (verbatim loader; null = belum ditetapkan). */
  allowanceNote?: string | null
  /** Penanda bentuk bahan kategori: plat|profil|lain (null = belum ditetapkan). */
  materialShape?: string | null
}

export interface ScrapReportLine extends ScrapReportLineInput {
  /** null bila plannedQty 0 (unplanned) — qty absolut saja. */
  lineRatePct: number | null
  reviewStatus: string | null
  reviewDisposition: string | null
  remnantQty: number
  scrapWeightKg: number
  allowanceNote: string | null
  materialShape: string | null
  /** Selisih rekonsiliasi BR-SCRAP-07; null bila installedQty tidak dinilai. */
  reconciliationVarianceQty: number | null
  reconciliationFinding: boolean
}

export interface ScrapReportResult {
  lines: ScrapReportLine[]
  totals: {
    issueQty: number
    plannedQty: number
    scrapQty: number
    normalQty: number
    abnormalQty: number
    normalValue: number
    abnormalValue: number
    /** Rate agregat: total scrap / total issue qty (penyebut issue, bukan planned). */
    aggregateRatePct: number | null
    abnormalJournalValue: number
    /** abnormalValue - jurnal abnormal tercatat; >0 saat flag OFF = temuan S8. */
    abnormalUnjournaledValue: number
    lineCount: number
    uncalibratedLines: number
    // F-098-S: antrean tinjau + kg besi tua + temuan rekonsiliasi.
    pendingReviewLines: number
    reviewedLines: number
    scrapWeightKgTotal: number
    reconciliationFindingLines: number
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function buildScrapMaterialReport(input: {
  lines: ScrapReportLineInput[]
  /** Total nilai jurnal ProductionOrderAbnormalScrap terverifikasi periode (0 flag OFF). */
  abnormalJournalValue?: number
}): ScrapReportResult {
  const lines: ScrapReportLine[] = input.lines.map((l) => {
    const remnantQty = round2(Math.max(0, Number(l.remnantQty ?? 0)))
    const scrapWeightKg = round2(Math.max(0, Number(l.scrapWeightKg ?? 0)))
    // Terpasang eksplisit dari loader; tanpa itu rekonsiliasi tidak dinilai
    // (null), bukan ditebak issue-scrap-remnant (BR-SCRAP-07 jujur).
    const variance =
      l.installedQty == null
        ? null
        : round2(Number(l.issueQty) - Number(l.installedQty) - remnantQty - Number(l.scrapQty))
    return {
      ...l,
      lineRatePct: l.plannedQty > 0 ? round2((l.scrapQty / l.plannedQty) * 10000) / 100 : null,
      reviewStatus: l.reviewStatus ?? null,
      reviewDisposition: l.reviewDisposition ?? null,
      remnantQty,
      scrapWeightKg,
      allowanceNote: l.allowanceNote ?? null,
      materialShape: l.materialShape ?? null,
      reconciliationVarianceQty: variance,
      reconciliationFinding: variance != null && Math.abs(variance) > 0.0001,
    }
  })
  const sum = (f: (l: ScrapReportLineInput) => number) =>
    round2(lines.reduce((a, l) => a + f(l), 0))
  const issueQty = sum((l) => l.issueQty)
  const abnormalValue = sum((l) => l.abnormalValue)
  const abnormalJournalValue = round2(input.abnormalJournalValue ?? 0)
  return {
    lines,
    totals: {
      issueQty,
      plannedQty: sum((l) => l.plannedQty),
      scrapQty: sum((l) => l.scrapQty),
      normalQty: sum((l) => l.normalQty),
      abnormalQty: sum((l) => l.abnormalQty),
      normalValue: sum((l) => l.normalValue),
      abnormalValue,
      aggregateRatePct: issueQty > 0 ? round2((sum((l) => l.scrapQty) / issueQty) * 10000) / 100 : null,
      abnormalJournalValue,
      abnormalUnjournaledValue: round2(abnormalValue - abnormalJournalValue),
      lineCount: lines.length,
      uncalibratedLines: lines.filter((l) => l.uncalibrated).length,
      pendingReviewLines: lines.filter((l) => l.reviewStatus === "menunggu_tinjau").length,
      reviewedLines: lines.filter((l) => l.reviewStatus === "ditinjau").length,
      scrapWeightKgTotal: sum((l) => l.scrapWeightKg ?? 0),
      reconciliationFindingLines: lines.filter((l) => l.reconciliationFinding).length,
    },
  }
}

import { formatAccounting, formatDate, formatNumber } from "@/lib/utils/format"
import type { TableDocument } from "@/lib/pdf/engine/types"

export function buildScrapMaterialTable(report: ScrapReportResult): TableDocument["table"] {
  const columns: TableDocument["table"]["columns"] = [
    { header: "Dokumen", align: "left", width: 30 },
    { header: "Tanggal", align: "left", width: 24 },
    { header: "Barang", align: "left", width: 36 },
    { header: "Qty Issue", align: "right", width: 20 },
    { header: "Qty Scrap", align: "right", width: 20 },
    { header: "Alasan Scrap", align: "left", width: 30 },
    { header: "Normal", align: "right", width: 20 },
    { header: "Abnormal", align: "right", width: 20 },
    { header: "Nilai Abnormal", align: "right", width: 28 },
    { header: "Scrap %", align: "right", width: 18 },
    { header: "Kalibrasi", align: "left", width: 21 },
    { header: "Tinjau", align: "left", width: 21 },
    { header: "Besi Tua (kg)", align: "right", width: 20 },
    { header: "Rekonsiliasi", align: "left", width: 24 },
  ]
  if (report.lines.length === 0) {
    return { columns, rows: [{ kind: "notice", text: "Belum ada baris scrap pada periode ini." }] }
  }
  const t = report.totals
  const rows: TableDocument["table"]["rows"] = [
    ...report.lines.map((l): TableDocument["table"]["rows"][number] => ({
      kind: "data",
      cells: [
        `${l.source} ${l.documentNo}`,
        formatDate(l.date, { format: "numeric" }),
        l.itemName ?? "-",
        formatNumber(l.issueQty, 2),
        formatNumber(l.scrapQty, 2),
        l.scrapReasonLabel ?? l.scrapReasonCode ?? "-",
        formatNumber(l.normalQty, 2),
        formatNumber(l.abnormalQty, 2),
        formatAccounting(l.abnormalValue, { zeroDash: false }),
        l.lineRatePct == null ? "-" : `${formatNumber(l.lineRatePct, 2)}%`,
        l.uncalibrated ? "Belum kalibrasi" : "Terkalibrasi",
        l.reviewStatus === "menunggu_tinjau"
          ? "Abnormal belum ditinjau"
          : l.reviewStatus === "ditinjau"
            ? `Ditinjau${l.reviewDisposition ? `: ${l.reviewDisposition}` : ""}`
            : "-",
        formatNumber(l.scrapWeightKg, 2),
        l.reconciliationVarianceQty == null
          ? "-"
          : l.reconciliationFinding
            ? `Selisih ${formatNumber(l.reconciliationVarianceQty, 2)}`
            : "Sesuai",
      ],
    })),
    { kind: "total", label: `Total (${t.lineCount} baris)`, grand: true, cells: [
      formatNumber(t.issueQty, 2), formatNumber(t.scrapQty, 2), "",
      formatNumber(t.normalQty, 2), formatNumber(t.abnormalQty, 2),
      formatAccounting(t.abnormalValue, { zeroDash: false }),
      t.aggregateRatePct == null ? "-" : `${formatNumber(t.aggregateRatePct, 2)}%`, "",
      `${t.pendingReviewLines} belum ditinjau`,
      formatNumber(t.scrapWeightKgTotal, 2),
      t.reconciliationFindingLines > 0 ? `${t.reconciliationFindingLines} temuan selisih` : "Sesuai",
    ]},
  ]
  return { columns, rows }
}

export function scrapMaterialSummary(report: ScrapReportResult, postingEnabled: boolean): string {
  const t = report.totals
  const flag = postingEnabled ? "Mode posting: jurnal abnormal posting" : "Mode catat-dulu: jurnal abnormal tidak posting"
  const parts = [flag, `Nilai abnormal ${formatAccounting(t.abnormalValue, { zeroDash: false })}`, `Terjurnal ${formatAccounting(t.abnormalJournalValue, { zeroDash: false })}`]
  if (t.abnormalUnjournaledValue > 0) parts.push(`Temuan: abnormal belum terjurnal ${formatAccounting(t.abnormalUnjournaledValue, { zeroDash: false })}`)
  if (t.uncalibratedLines > 0) parts.push(`${t.uncalibratedLines} baris belum kalibrasi`)
  if (t.pendingReviewLines > 0) parts.push(`${t.pendingReviewLines} abnormal belum ditinjau`)
  if (t.scrapWeightKgTotal > 0) parts.push(`Besi tua ${formatNumber(t.scrapWeightKgTotal, 2)} kg`)
  if (t.reconciliationFindingLines > 0) parts.push(`${t.reconciliationFindingLines} temuan selisih rekonsiliasi`)
  return parts.join(" · ")
}
