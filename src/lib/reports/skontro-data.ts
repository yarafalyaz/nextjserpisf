/**
 * Pemuatan data untuk laporan **Neraca Induk Skontro**.
 *
 * Memakai bagian neraca yang sama dengan `/laporan/neraca`
 * (`loadBalanceSheetParts`) supaya angka kedua laporan tidak mungkin berbeda —
 * skontro hanya bentuk penyajiannya.
 */

import { loadBalanceSheetParts } from "@/lib/reports/statement-data"
import { buildSkontroBalanceSheet, type SkontroLine } from "@/lib/reports/skontro"
import type { StatementDisplayOptions } from "@/lib/reports/statement-display"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export interface SkontroBalanceSheetReport {
  table: { columns: TableColumn[]; rows: TableRow[] }
  asOfLabel: string
  periodLabel: string
  periodCaption: string
}

function toLines(
  rows: { code: string; name: string; balance: number; hasChildren: boolean }[],
): SkontroLine[] {
  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    balance: row.balance,
    hasChildren: row.hasChildren,
  }))
}

export async function loadSkontroBalanceSheet(
  asOfDate: Date,
  options: StatementDisplayOptions,
): Promise<SkontroBalanceSheetReport> {
  const parts = await loadBalanceSheetParts(asOfDate, options)

  return {
    table: buildSkontroBalanceSheet({
      assetRows: toLines(parts.assetRows),
      liabilityRows: toLines(parts.liabilityRows),
      equityRows: toLines(parts.equityRows),
      totalAssets: parts.totalAssets,
      totalLiabilities: parts.totalLiabilities,
      totalEquity: parts.totalEquity,
      isBalanced: parts.isBalanced,
    }),
    asOfLabel: parts.asOfLabel,
    periodLabel: `Per ${parts.asOfLabel}`,
    periodCaption: `Per ${parts.asOfLabel}`,
  }
}
