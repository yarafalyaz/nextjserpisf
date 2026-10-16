/**
 * Rincian jurnal pekerjaan pesanan — seluruh jurnal yang lahir dari alur
 * pekerjaan: pengeluaran bahan, penyerapan biaya produksi, penyelesaian ke stok,
 * dan selisih pembulatan biaya.
 *
 * Jurnalnya TIDAK menempel langsung ke pekerjaan. `Journal.referenceType` menunjuk
 * dokumen yang memicunya (`MaterialIssue`, `ProductionCost`, `ProductionOrder`),
 * dan baru dari dokumen itulah nomor pekerjaan diketahui — karena itu pemanggil
 * (loader) yang menyelesaikan label pekerjaannya, sedangkan file ini hanya
 * menyusun tabelnya. Jurnal yang dokumennya tidak terhubung ke pekerjaan tetap
 * ditampilkan dengan label "Tanpa pekerjaan" alih-alih disembunyikan: jurnal
 * adalah bukti, bukan ringkasan.
 *
 * Penyusunan tabelnya memakai `journal-listing.ts` bersama laporan jurnal aset.
 */

import { buildJournalListing, shortJournalDate } from "@/lib/reports/journal-listing"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

/** referenceType jurnal yang berasal dari alur produksi/pekerjaan pesanan. */
export const JOB_JOURNAL_REFERENCE_TYPES = [
  "ProductionOrder",
  "ProductionOrderMaterialIssue",
  "ProductionOrderCostVariance",
  "ProductionCost",
  "MaterialIssue",
] as const

const REFERENCE_LABELS: Record<string, string> = {
  ProductionOrder: "Penyelesaian Produksi",
  ProductionOrderMaterialIssue: "Bahan Perintah Produksi",
  ProductionOrderCostVariance: "Selisih Biaya Produksi",
  ProductionCost: "Penyerapan Biaya Produksi",
  MaterialIssue: "Pengeluaran Bahan",
}

/** Label jenis dokumen pemicu jurnal; `null` bila bukan jurnal pekerjaan. */
export function jobJournalLabel(referenceType: string): string | null {
  return REFERENCE_LABELS[referenceType] ?? null
}

/** Apakah referenceType ini termasuk jurnal pekerjaan pesanan? */
export function isJobJournalReference(referenceType: string): boolean {
  return (JOB_JOURNAL_REFERENCE_TYPES as readonly string[]).includes(referenceType)
}

export interface JobOrderJournalLineInput {
  accountCode: string
  accountName: string
  debit: number
  credit: number
}

export interface JobOrderJournalInput {
  id: number
  journalNumber: string
  date: Date
  referenceType: string
  /** Nomor pekerjaan bila dokumennya bisa dilacak; `null` = tidak terhubung. */
  jobLabel: string | null
  description: string | null
  lines: JobOrderJournalLineInput[]
}

export interface JobOrderJournalReferenceSummary {
  referenceType: string
  label: string
  count: number
  amount: number
}

export interface JobOrderJournalResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  byReference: JobOrderJournalReferenceSummary[]
  journalCount: number
  totalDebit: number
  totalCredit: number
  isBalanced: boolean
}

/** Susun rincian jurnal: satu blok per jurnal, dikelompokkan per dokumen pemicu. */
export function buildJobOrderJournal(input: { journals: JobOrderJournalInput[] }): JobOrderJournalResult {
  const { journals } = input

  const byReference = new Map<string, JobOrderJournalReferenceSummary>()
  for (const journal of journals) {
    const label = jobJournalLabel(journal.referenceType) ?? journal.referenceType
    const debit = journal.lines.reduce((sum, line) => sum + line.debit, 0)
    const bucket = byReference.get(journal.referenceType) ?? {
      referenceType: journal.referenceType,
      label,
      count: 0,
      amount: 0,
    }
    bucket.count += 1
    bucket.amount += debit
    byReference.set(journal.referenceType, bucket)
  }

  const listing = buildJournalListing({
    emptyNotice:
      "Tidak ada jurnal pekerjaan pesanan pada periode ini. Jurnal lahir saat bahan dikeluarkan, biaya produksi diserap, " +
      "dan penyelesaian dilepas ke stok.",
    journals: journals.map((journal) => ({
      id: journal.id,
      journalNumber: journal.journalNumber,
      date: journal.date,
      title: [
        shortJournalDate(journal.date),
        journal.journalNumber,
        jobJournalLabel(journal.referenceType) ?? journal.referenceType,
        journal.jobLabel ?? "Tanpa pekerjaan",
      ].join(" · "),
      description: journal.description,
      lines: journal.lines,
    })),
  })

  return {
    ...listing,
    byReference: [...byReference.values()].sort((a, b) => a.label.localeCompare(b.label, "id-ID")),
  }
}
