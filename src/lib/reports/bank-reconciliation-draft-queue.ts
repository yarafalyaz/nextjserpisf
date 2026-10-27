/**
 * F-2026-10-27-097-S tahap 1 — antrean rekonsiliasi bank draft mengendap.
 *
 * Turunan murni baca-saja: populasi BankReconciliation `status = "draft"`
 * + `deletedAt` null persis (BR-RBK-01). Saldo payload verbatim header
 * (`statementBalance`/`bookBalance`); TANPA selisih turunan, status
 * seimbang, persen, atau label siap-selesai (BR-RBK-04/05, Q-RBK-5).
 *
 * PUTUSAN LEAD Q-RBK (komentar PR #1173 6436288622, 27 Okt 2026):
 * - Q-RBK-1: `mengendap` = umur >= 3 hari kalender WIB sejak `createdAt`
 *   (konstanta di bawah); `menunggu` < 3. Urutan `createdAt` naik, seri
 *   `id` naik. `updatedAt` DILARANG acuan (BR-RBK-03).
 * - Q-RBK-2: kata usulan §8 spec disahkan — judul/label satu konstanta
 *   label server di sini; UI menempel apa adanya.
 * - Q-RBK-3: hitungan mentah tercocok saja (x dari y), TANPA persen.
 * - Q-RBK-4/6: baca-saja nol aksi; gerbang `view_bank_reconciliation`
 *   saja di loader, tanpa pembatasan per-akun.
 *
 * Pure (tanpa Prisma/DOM). Loader: `bank-reconciliation-draft-queue-data.ts`.
 */

import { wibDayNumber } from "@/lib/reports/employee-lifecycle"

/** Ambang umur draft (hari kalender WIB) untuk tingkat `mengendap` (Q-RBK-1: 3). */
export const BANK_RECONCILIATION_DRAFT_STALE_DAYS = 3

export const BANK_RECONCILIATION_DRAFT_LEVELS = ["mengendap", "menunggu"] as const

export type BankReconciliationDraftLevel = (typeof BANK_RECONCILIATION_DRAFT_LEVELS)[number]

/** Judul antrean verbatim Q-RBK-2 — UI menempel apa adanya. */
export const BANK_RECONCILIATION_DRAFT_TITLE = "Rekonsiliasi Bank Belum Selesai"

/** Label tingkat verbatim Q-RBK-2 — UI menempel apa adanya. */
export const BANK_RECONCILIATION_DRAFT_LEVEL_LABELS: Record<BankReconciliationDraftLevel, string> = {
  mengendap: "Mengendap",
  menunggu: "Menunggu",
}

/** Judul kolom verbatim Q-RBK-2. */
export const BANK_RECONCILIATION_DRAFT_COLUMN_LABELS = {
  number: "Nomor Rekonsiliasi",
  account: "Akun Bank",
  statementDate: "Tanggal Koran",
  progress: "Kemajuan Pencocokan",
  age: "Menunggu Penyelesaian",
} as const

/** Notice verbatim Q-RBK-2 — UI menempel apa adanya. */
export const BANK_RECONCILIATION_DRAFT_NOTICE_TEXT =
  "Daftar ini hanya rekonsiliasi bank yang masih draft dan belum selesai. Saldo tampil apa adanya dari dokumen; selisih dan status seimbang hanya ditentukan saat rekonsiliasi diselesaikan lewat detail."

export interface BankReconciliationDraftInput {
  reconciliationId: number
  slug: string | null
  reconciliationNumber: string | null
  /** Status apa adanya; builder hanya menerima persis "draft". */
  status: string
  deletedAt: Date | null
  accountId: number
  /** Kode/nama akun verbatim loader; null bila akun tak ditemukan. */
  accountCode: string | null
  accountName: string | null
  statementDate: Date
  periodStart: Date | null
  periodEnd: Date | null
  /** Saldo verbatim header (Decimal sudah di-Number di tepi loader). */
  statementBalance: number
  bookBalance: number
  createdAt: Date
  /** Fakta item teragregat massal loader (BR-RBK-04). */
  totalItemCount: number
  /** Item pencocokan = bankStatementLineId/journalEntryId salah satu terisi. */
  matchingItemCount: number
  matchedItemCount: number
  /** Item penyesuaian = kedua tautan null. */
  adjustmentItemCount: number
}

export interface BankReconciliationDraftRow extends BankReconciliationDraftInput {
  tingkat: BankReconciliationDraftLevel
  tingkatLabel: string
  /** Hari kalender WIB sejak createdAt; masa depan = 0 tertanda. */
  umurDraftHari: number
  umurDariMasaDepan: boolean
}

export interface BankReconciliationDraftQueue {
  rows: BankReconciliationDraftRow[]
  levelCounts: Record<BankReconciliationDraftLevel, number>
  totalDocuments: number
}

export function buildBankReconciliationDraftQueue(
  inputs: BankReconciliationDraftInput[],
  now: Date = new Date(),
  staleDays: number = BANK_RECONCILIATION_DRAFT_STALE_DAYS,
): BankReconciliationDraftQueue {
  const todayNumber = wibDayNumber(now)
  const rows: BankReconciliationDraftRow[] = []

  for (const input of inputs) {
    if (input.status !== "draft" || input.deletedAt != null) continue
    const diff = todayNumber - wibDayNumber(input.createdAt)
    const umurDraftHari = Math.max(0, diff)
    const tingkat: BankReconciliationDraftLevel = umurDraftHari >= staleDays ? "mengendap" : "menunggu"
    rows.push({
      ...input,
      tingkat,
      tingkatLabel: BANK_RECONCILIATION_DRAFT_LEVEL_LABELS[tingkat],
      umurDraftHari,
      umurDariMasaDepan: diff < 0,
    })
  }

  // Q-RBK-1: tertua menunggu dulu (createdAt naik), seri id naik.
  rows.sort((a, b) => {
    const createdDiff = a.createdAt.getTime() - b.createdAt.getTime()
    if (createdDiff !== 0) return createdDiff
    return a.reconciliationId - b.reconciliationId
  })

  const levelCounts: Record<BankReconciliationDraftLevel, number> = { mengendap: 0, menunggu: 0 }
  for (const row of rows) levelCounts[row.tingkat] += 1

  return { rows, levelCounts, totalDocuments: rows.length }
}
