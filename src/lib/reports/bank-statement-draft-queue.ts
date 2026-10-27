/**
 * F-2026-10-27-096-S (096-B+F) — antrean rekening koran draft mengendap.
 * Turunan murni baca-saja di atas BankStatement draft.
 *
 * PUTUSAN LEAD (final):
 * - Q-BSQ-1: `Mengendap` = umur >= 3 hari kalender WIB sejak
 *   `BankStatement.createdAt` (konstanta server bernama di bawah);
 *   urutan `createdAt` naik, seri `id` naik.
 * - Q-BSQ-2: kata verbatim di bawah — judul `Rekening Koran Draft
 *   Mengendap`; ember `Belum Ada Baris` / `Belum Semua Tercocokkan`.
 *   Satu konstanta label server; UI menempel apa adanya.
 * - Q-BSQ-4: baca-saja, tanpa tombol tulis dari antrean.
 * - Q-BSQ-5: status header dibaca apa adanya; tidak ada transisi baru.
 *
 * Populasi persis `status === "draft"` + `deletedAt` null + (belum ada
 * baris ATAU ada baris belum tercocokkan) (BR-BSQ-01). Koran yang semua
 * barisnya tercocokkan keluar populasi walau header tetap `draft`.
 *
 * "Tercocokkan" WAJIB definisi ganda existing laporan rekonsiliasi
 * transaksi bank (BR-BSQ-02): status baris `matched` ATAU item
 * rekonsiliasi `matched=true` untuk baris itu. Satu baris dihitung
 * tercocokkan satu kali walau dipakai dua rekonsiliasi (EC-BSQ-5).
 *
 * Umur hanya dari `createdAt` hari kalender WIB (BR-BSQ-04):
 * `updatedAt`/`date`/`periodEnd` diterima sebagai bawaan rekod tetapi
 * SENGAJA tidak dibaca untuk umur.
 *
 * Nominal payload verbatim header (`openingBalance`/`closingBalance`/
 * `totalDebits`/`totalCredits`) berlabel tercatat di rekening koran
 * (BR-BSQ-05) — bukan turunan buku apa pun, tidak dihitung ulang dari
 * baris, dan tidak dijumlahkan lintas koran (rekap = hitungan saja).
 * Antrean tidak menyimpulkan kesiapan penyelesaian (BR-BSQ-12).
 *
 * Pure (tanpa Prisma/DOM). Loader: `bank-statement-draft-queue-data.ts`.
 */

import { wibDayNumber } from "@/lib/reports/employee-lifecycle"

/** Ambang Mengendap: umur >= 3 hari kalender WIB sejak createdAt (Q-BSQ-1). */
export const BANK_STATEMENT_DRAFT_MENGENDAP_MIN_DAYS = 3

/** Batas baris tampil; rekap tetap dari populasi penuh. */
export const BANK_STATEMENT_DRAFT_QUEUE_LIMIT = 100

/** Judul antrean verbatim Q-BSQ-2 — UI menempel apa adanya. */
export const BANK_STATEMENT_DRAFT_QUEUE_TITLE = "Rekening Koran Draf Mengendap"

/** Label nominal verbatim BR-BSQ-05 — nominal header tercatat apa adanya. */
export const BANK_STATEMENT_DRAFT_NOMINAL_LABEL = "tercatat di rekening koran"

/** Label kolom verbatim Q-BSQ-2 — UI menempel apa adanya. */
export const BANK_STATEMENT_DRAFT_QUEUE_COLUMN_LABELS = {
  account: "Akun Bank",
  date: "Tanggal",
  reference: "Referensi",
  period: "Periode",
  ember: "Keadaan Baris",
  baris: "Baris",
  umur: "Umur Menunggu",
  tingkat: "Tingkat",
  nominalTercatat: "Nominal Tercatat",
  uploadedBy: "Pembuat",
} as const

export const BANK_STATEMENT_DRAFT_QUEUE_NOTICE_TEXT =
  "Daftar rekening koran yang masih draft: belum ada baris, atau barisnya belum semua tercocokkan. Nominal tampil tercatat di rekening koran apa adanya dari dokumen. Daftar ini baca-saja; baris ditambah lewat detail rekening koran dan pencocokan dilakukan lewat rekonsiliasi bank yang ada."

export const BANK_STATEMENT_DRAFT_QUEUE_EMPTY_TEXT =
  "Tidak ada rekening koran draft yang mengendap."

export const BANK_STATEMENT_DRAFT_QUEUE_TRUNCATED_LABEL = "Terpotong"

export const BANK_STATEMENT_DRAFT_LEVELS = ["mengendap", "menunggu"] as const

export type BankStatementDraftLevel = (typeof BANK_STATEMENT_DRAFT_LEVELS)[number]

export const BANK_STATEMENT_DRAFT_LEVEL_LABELS: Record<BankStatementDraftLevel, string> = {
  mengendap: "Mengendap",
  menunggu: "Menunggu",
}

export const BANK_STATEMENT_DRAFT_BUCKETS = [
  "belum_ada_baris",
  "belum_semua_tercocokkan",
] as const

export type BankStatementDraftBucket = (typeof BANK_STATEMENT_DRAFT_BUCKETS)[number]

/** Label ember verbatim Q-BSQ-2 — UI menempel apa adanya. */
export const BANK_STATEMENT_DRAFT_BUCKET_LABELS: Record<BankStatementDraftBucket, string> = {
  belum_ada_baris: "Belum Ada Baris",
  belum_semua_tercocokkan: "Belum Semua Tercocokkan",
}

export interface BankStatementDraftLineInput {
  lineId: number
  /** Status baris apa adanya (`unmatched` default, `matched`, atau asing). */
  status: string
  /** Ada item rekonsiliasi `matched=true` untuk baris ini (dedup per baris). */
  hasMatchedReconciliationItem: boolean
}

export interface BankStatementDraftInput {
  statementId: number
  slug: string | null
  /** Status header apa adanya; builder hanya menerima persis "draft". */
  status: string
  deletedAt: Date | null
  accountId: number
  /** Kode/nama akun verbatim loader; null bila akun tak ditemukan. */
  accountCode: string | null
  accountName: string | null
  accountNumber: string | null
  /** Tanggal dokumen tersimpan — tampil verbatim, BUKAN acuan umur. */
  date: Date
  reference: string | null
  periodStart: Date | null
  periodEnd: Date | null
  /** Nominal header tersimpan verbatim (Decimal sudah di-Number di loader). */
  openingBalance: number
  closingBalance: number
  totalDebits: number
  totalCredits: number
  createdAt: Date
  /** Bawaan rekod — SENGAJA tidak dibaca builder (BR-BSQ-04). */
  updatedAt?: Date | null
  uploadedBy: number | null
  uploadedByName: string | null
  /** Baris koran apa adanya; builder menerapkan definisi ganda BR-BSQ-02. */
  lines: BankStatementDraftLineInput[]
}

export interface BankStatementDraftRow {
  statementId: number
  slug: string | null
  status: string
  accountId: number
  accountCode: string | null
  accountName: string | null
  accountNumber: string | null
  date: Date
  reference: string | null
  periodStart: Date | null
  periodEnd: Date | null
  openingBalance: number
  closingBalance: number
  totalDebits: number
  totalCredits: number
  nominalLabel: string
  createdAt: Date
  /** Hari kalender WIB sejak createdAt; masa depan ditahan 0. */
  umurHari: number
  umurLabel: string
  umurDariMasaDepan: boolean
  tingkat: BankStatementDraftLevel
  tingkatLabel: string
  ember: BankStatementDraftBucket
  emberLabel: string
  /** Fakta hitung baris (BR-BSQ-03) — bukan status baru. */
  totalLineCount: number
  matchedLineCount: number
  remainingLineCount: number
  uploadedBy: number | null
  uploadedByName: string | null
}

export interface BankStatementDraftQueue {
  rows: BankStatementDraftRow[]
  /** Rekap hitungan per ember dari populasi PENUH (sebelum potong). */
  bucketCounts: Record<BankStatementDraftBucket, number>
  /** Hitungan per tingkat dari populasi PENUH (sebelum potong). */
  levelCounts: Record<BankStatementDraftLevel, number>
  totalPopulation: number
  displayedCount: number
  terpotong: boolean
  truncated: boolean
  limit: number
  noticeText: string
  title: string
  nominalLabel: string
}

export function buildBankStatementDraftQueue(
  inputs: readonly BankStatementDraftInput[],
  now: Date = new Date(),
  limit: number = BANK_STATEMENT_DRAFT_QUEUE_LIMIT,
): BankStatementDraftQueue {
  const todayNumber = wibDayNumber(now)
  const fullRows: BankStatementDraftRow[] = []

  for (const input of inputs) {
    // BR-BSQ-01: populasi persis draft + tidak terhapus lunak.
    if (input.status !== "draft" || input.deletedAt != null) continue

    // BR-BSQ-02: definisi ganda — status baris matched ATAU item matched.
    let matchedLineCount = 0
    for (const line of input.lines) {
      if (line.status === "matched" || line.hasMatchedReconciliationItem) {
        matchedLineCount += 1
      }
    }
    const totalLineCount = input.lines.length
    const remainingLineCount = totalLineCount - matchedLineCount

    // BR-BSQ-01: semua baris tercocokkan -> keluar populasi.
    if (totalLineCount > 0 && remainingLineCount === 0) continue

    const ember: BankStatementDraftBucket =
      totalLineCount === 0 ? "belum_ada_baris" : "belum_semua_tercocokkan"

    const diff = todayNumber - wibDayNumber(input.createdAt)
    const umurHari = Math.max(0, diff)
    const tingkat: BankStatementDraftLevel =
      umurHari >= BANK_STATEMENT_DRAFT_MENGENDAP_MIN_DAYS ? "mengendap" : "menunggu"

    fullRows.push({
      statementId: input.statementId,
      slug: input.slug,
      status: input.status,
      accountId: input.accountId,
      accountCode: input.accountCode,
      accountName: input.accountName,
      accountNumber: input.accountNumber,
      date: input.date,
      reference: input.reference,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      openingBalance: input.openingBalance,
      closingBalance: input.closingBalance,
      totalDebits: input.totalDebits,
      totalCredits: input.totalCredits,
      nominalLabel: BANK_STATEMENT_DRAFT_NOMINAL_LABEL,
      createdAt: input.createdAt,
      umurHari,
      umurLabel: `${umurHari} hari`,
      umurDariMasaDepan: diff < 0,
      tingkat,
      tingkatLabel: BANK_STATEMENT_DRAFT_LEVEL_LABELS[tingkat],
      ember,
      emberLabel: BANK_STATEMENT_DRAFT_BUCKET_LABELS[ember],
      totalLineCount,
      matchedLineCount,
      remainingLineCount,
      uploadedBy: input.uploadedBy,
      uploadedByName: input.uploadedByName,
    })
  }

  // Q-BSQ-1/BR-BSQ-09: tertua menunggu dulu (createdAt naik), seri id naik.
  fullRows.sort((a, b) => {
    const createdDiff = a.createdAt.getTime() - b.createdAt.getTime()
    if (createdDiff !== 0) return createdDiff
    return a.statementId - b.statementId
  })

  // Rekap dari populasi PENUH sebelum pemotongan tampil.
  const bucketCounts: Record<BankStatementDraftBucket, number> = {
    belum_ada_baris: 0,
    belum_semua_tercocokkan: 0,
  }
  const levelCounts: Record<BankStatementDraftLevel, number> = {
    mengendap: 0,
    menunggu: 0,
  }
  for (const row of fullRows) {
    bucketCounts[row.ember] += 1
    levelCounts[row.tingkat] += 1
  }

  const safeLimit = Math.max(0, Math.floor(limit))
  const rows = fullRows.slice(0, safeLimit)

  return {
    rows,
    bucketCounts,
    levelCounts,
    totalPopulation: fullRows.length,
    displayedCount: rows.length,
    terpotong: fullRows.length > safeLimit,
    truncated: fullRows.length > safeLimit,
    limit: safeLimit,
    noticeText: BANK_STATEMENT_DRAFT_QUEUE_NOTICE_TEXT,
    title: BANK_STATEMENT_DRAFT_QUEUE_TITLE,
    nominalLabel: BANK_STATEMENT_DRAFT_NOMINAL_LABEL,
  }
}
