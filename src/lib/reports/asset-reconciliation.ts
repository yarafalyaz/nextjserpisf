/**
 * Rekonsiliasi tiga jalur aset tetap — vonis BOT 4 F-2026-10-22-062-V Putusan 1.
 *
 * Tiga representasi nilai buku dibandingkan per aset:
 *   1. JURNAL POSTED (sumber tunggal): perolehan − akumulasi − pelepasan,
 *      dari `journalBookValue`.
 *   2. CACHE kolom `Asset.currentValue` (+ harga perolehan kolom).
 *   3. CACHE riwayat Σ `AssetHistory type=depreciation`.
 * Selisih tampil sebagai TEMUAN per aset — tidak dipilih diam-diam salah
 * satu, tidak ditimpa. Koreksi hanya lewat jurnal koreksi/reversal periode
 * terbuka (di luar read-model ini; read-model tidak menulis apa pun).
 *
 * Pure (tanpa Prisma/DOM). Uang Decimal presisi Decimal(15,2); perbandingan
 * dalam sen supaya float tidak menyembunyikan selisih 1 sen pun.
 */

import { Prisma } from "@prisma/client"
import { journalBookValue, type AssetJournalInput } from "@/lib/finance/asset-book-value"
import { formatAccounting } from "@/lib/utils/format"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

const COLUMNS: TableColumn[] = [
  { header: "Aset", align: "left", width: 62 },
  { header: "Nilai Buku Jurnal", align: "right", width: 40 },
  { header: "currentValue (cache)", align: "right", width: 40 },
  { header: "Akum. History (cache)", align: "right", width: 40 },
  { header: "Temuan", align: "left", width: 80 },
]

export type AssetReconciliationFindingKind =
  | "not-journaled"
  | "gross-mismatch"
  | "value-mismatch"
  | "history-mismatch"

export interface AssetReconciliationInput {
  assetId: number
  code: string
  name: string
  categoryName: string | null
  /** Kolom cache `Asset.purchaseCost`. */
  purchaseCost: Prisma.Decimal | number | string
  /** Kolom cache `Asset.currentValue`. */
  currentValue: Prisma.Decimal | number | string
  /** Σ AssetHistory type=depreciation (cache riwayat). */
  historyDepreciationTotal: Prisma.Decimal | number | string
  status: string
  categoryAccounts: { fixedAssetAccountId: number | null; accumulatedDepreciationAccountId: number | null }
  /** Jurnal POSTED aset ini saja (disaring loader). */
  journals: AssetJournalInput[]
}

export interface AssetReconciliationFinding {
  kind: AssetReconciliationFindingKind
  detail: string
}

export interface AssetReconciliationRow {
  assetId: number
  code: string
  name: string
  journalBookValue: Prisma.Decimal
  cacheBookValue: Prisma.Decimal
  historyAccumulated: Prisma.Decimal
  findings: AssetReconciliationFinding[]
}

export interface AssetReconciliationResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  rows: AssetReconciliationRow[]
  totals: { assets: number; withFindings: number; notJournaled: number }
  verdict: string
}

function dec(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value)
}

function differs(a: Prisma.Decimal, b: Prisma.Decimal): boolean {
  return !a.toDecimalPlaces(2).equals(b.toDecimalPlaces(2))
}

function amount(value: Prisma.Decimal): string {
  return formatAccounting(value.toNumber(), { zeroDash: false })
}

export function reconcileAsset(input: AssetReconciliationInput): AssetReconciliationRow {
  const posted = journalBookValue(input.journals, input.categoryAccounts)
  const purchaseCost = dec(input.purchaseCost)
  const currentValue = dec(input.currentValue)
  const historyAccumulated = dec(input.historyDepreciationTotal)
  const findings: AssetReconciliationFinding[] = []

  if (!posted.hasAcquisitionJournal) {
    // Aset legacy subledger-only: lahir tanpa jurnal perolehan (dulu
    // "skipped silently"). Bukan angka jurnal — temuan, bukan nilai buku.
    if (purchaseCost.gt(0)) {
      findings.push({
        kind: "not-journaled",
        detail: "Belum berjurnal: tidak ada jurnal perolehan POSTED; nilai buku jurnal tidak terbentuk.",
      })
    }
  } else {
    if (differs(posted.grossCostPosted, purchaseCost)) {
      findings.push({
        kind: "gross-mismatch",
        detail: `Harga perolehan kolom ${amount(purchaseCost)} != debit jurnal perolehan ${amount(posted.grossCostPosted)}.`,
      })
    }
    if (differs(posted.bookValue, currentValue)) {
      findings.push({
        kind: "value-mismatch",
        detail: `currentValue ${amount(currentValue)} != nilai buku jurnal ${amount(posted.bookValue)}.`,
      })
    }
    // Akumulasi jurnal vs akumulasi riwayat hanya sebanding sebelum pelepasan
    // (pelepasan menghapus akumulasi lewat jurnal disposal, bukan history).
    if (posted.disposalGrossPosted.equals(0) && differs(posted.accumulatedPosted, historyAccumulated)) {
      findings.push({
        kind: "history-mismatch",
        detail: `Akumulasi history ${amount(historyAccumulated)} != kredit akumulasi jurnal ${amount(posted.accumulatedPosted)}.`,
      })
    }
  }

  return {
    assetId: input.assetId,
    code: input.code,
    name: input.name,
    journalBookValue: posted.bookValue,
    cacheBookValue: currentValue,
    historyAccumulated,
    findings,
  }
}

export function buildAssetReconciliation(
  inputs: AssetReconciliationInput[],
): AssetReconciliationResult {
  const rows = inputs.map(reconcileAsset)
  const withFindings = rows.filter((r) => r.findings.length > 0).length
  const notJournaled = rows.filter((r) => r.findings.some((f) => f.kind === "not-journaled")).length

  const tableRows: TableRow[] = rows.map((row) => ({
    kind: "data" as const,
    cells: [
      `${row.code} ${row.name}`,
      amount(row.journalBookValue),
      amount(row.cacheBookValue),
      amount(row.historyAccumulated),
      row.findings.length ? row.findings.map((f) => f.detail).join(" ") : "Sesuai",
    ],
  }))
  if (rows.length === 0) {
    tableRows.push({ kind: "notice", text: "Tidak ada aset untuk direkonsiliasi." })
  }

  return {
    table: { columns: COLUMNS, rows: tableRows },
    rows,
    totals: { assets: rows.length, withFindings, notJournaled },
    verdict:
      rows.length === 0
        ? "Tidak ada aset untuk direkonsiliasi"
        : withFindings === 0
          ? "Semua aset sesuai: jurnal, currentValue, dan history sama"
          : `${withFindings} dari ${rows.length} aset punya temuan rekonsiliasi` +
            (notJournaled > 0 ? ` · ${notJournaled} belum berjurnal` : ""),
  }
}
