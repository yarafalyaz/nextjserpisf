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
}

export interface ScrapReportLine extends ScrapReportLineInput {
  /** null bila plannedQty 0 (unplanned) — qty absolut saja. */
  lineRatePct: number | null
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
  const lines: ScrapReportLine[] = input.lines.map((l) => ({
    ...l,
    lineRatePct: l.plannedQty > 0 ? round2((l.scrapQty / l.plannedQty) * 10000) / 100 : null,
  }))
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
    },
  }
}
