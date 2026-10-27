/**
 * F-2026-10-26-055-S (055-B) — antrean draf penawaran basi belum terkirim.
 *
 * Turunan baca-saja dari Quotation `status="draft"` + `deletedAt=null`
 * (BR-QD-01; populasi disjungsi dari antrean sent F-2026-10-22-091-S).
 * Tahap TURUNAN dari `validUntil` vs hari kalender WIB — tanpa kolom
 * tersimpan, tanpa mutasi status/validUntil/dokumen/jurnal (BR-QD-02/05).
 * Semantik lewat persis guard server `assertQuotationNotExpired`: lewat
 * bila hari WIB hari ini > validUntil; hari validUntil sendiri masih
 * berlaku (sisa 0 = MENIPIS, bukan LEWAT — AC-QD-2). validUntil kosong =
 * TANPA_BATAS jujur, sisaHari null — dilarang mengarang sisa hari dari
 * createdAt/default form (BR-QD-03).
 *
 * Putusan Lead Q-QD-1 (PR #965): MENIPIS = sisa hari <= 3 (konstanta
 * `QUOTATION_DRAFT_EXPIRY_WARNING_DAYS`, sejajar F-091-S); TANPA tahap
 * umur-basi terpisah tahap 1 — umur sejak `createdAt` kolom fakta saja.
 * Q-QD-2: label + notice verbatim di bawah; UI menempel apa adanya.
 * Q-QD-3: urutan LEWAT_BELUM_TERKIRIM paling lama-lewat dulu, MENIPIS
 * sisa-hari terkecil, TANPA_BATAS umur `createdAt` tertua, TERBUKA
 * sisa-hari terkecil; seri akhir `documentNo` asc. Mode default hanya
 * tahap perlu-tindak (LEWAT_BELUM_TERKIRIM + MENIPIS).
 * Q-QD-5 (diratifikasi Lead): penjual kanonik = `salesEmployeeId` ->
 * Employee; null tampil `—`, DILARANG fallback ke `createdBy`/User.
 * Q-QD-6: draf item-0 tampil polos, tanpa hitung item (BR-QD-10).
 *
 * Pure (tanpa Prisma/DOM). Loader: `quotation-draft-queue-data.ts`.
 */

import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

/** Ambang hari kalender untuk tahap MENIPIS (Q-QD-1 Lead, PR #965). */
export const QUOTATION_DRAFT_EXPIRY_WARNING_DAYS = 3

export const QUOTATION_DRAFT_STAGES = [
  "LEWAT_BELUM_TERKIRIM",
  "MENIPIS",
  "TERBUKA",
  "TANPA_BATAS",
] as const

export type QuotationDraftStage = (typeof QUOTATION_DRAFT_STAGES)[number]

/** Label tahap verbatim Q-QD-2 — UI menempel apa adanya. */
export const QUOTATION_DRAFT_STAGE_LABELS: Record<QuotationDraftStage, string> = {
  LEWAT_BELUM_TERKIRIM: "Lewat Masa Berlaku — Belum Terkirim",
  MENIPIS: "Masa Berlaku Menipis",
  TERBUKA: "Terbuka",
  TANPA_BATAS: "Tanpa Masa Berlaku",
}

/** Notice kepala verbatim Q-QD-2 — UI menempel apa adanya. */
export const QUOTATION_DRAFT_NOTICE_TEXT =
  "Daftar ini hanya penawaran yang masih draft dan belum pernah dikirim. Draf belum menjadi penawaran ke pelanggan; kirim, revisi, atau hapus lewat detail penawaran."

const MS_PER_DAY = 86_400_000

export interface QuotationDraftInput {
  quotationId: number
  slug: string | null
  documentNo: string
  /** Status tersimpan apa adanya; builder hanya menerima persis "draft". */
  status: string
  /** deletedAt terisi = di luar populasi (BR-QD-01). */
  deletedAt: Date | null
  customerId: number
  customerName: string
  /** Penjual kanonik `salesEmployeeId` (Q-QD-5); null = tampil `—`. */
  salesEmployeeId: number | null
  salesEmployeeName: string | null
  /** Tanggal penawaran (`date`), tampil apa adanya. */
  date: Date
  validUntil: Date | null
  /** Momen draf masuk sistem; acuan umur fakta + urutan TANPA_BATAS. */
  createdAt: Date
  grandTotal: number
}

export interface QuotationDraftRow extends QuotationDraftInput {
  tahap: QuotationDraftStage
  tahapLabel: string
  /** Hari kalender WIB sampai validUntil; negatif = hari lewat. null bila TANPA_BATAS. */
  sisaHari: number | null
  /** Hari kalender WIB sejak createdAt; fakta tampil, bukan tahap (Q-QD-1). */
  umurDrafHari: number
}

function calendarDayDiff(fromUtcMidnight: Date, to: Date): number {
  return Math.round((to.getTime() - fromUtcMidnight.getTime()) / MS_PER_DAY)
}

/** Umur hari kalender WIB dari createdAt; masa depan = 0, bukan negatif. */
function ageInCalendarDays(createdAt: Date, todayUtcMidnight: Date): number {
  return Math.max(0, -calendarDayDiff(todayUtcMidnight, createdAt))
}

export function deriveQuotationDraftStage(
  validUntil: Date | null,
  todayUtcMidnight: Date,
  warningDays: number = QUOTATION_DRAFT_EXPIRY_WARNING_DAYS,
): { tahap: QuotationDraftStage; sisaHari: number | null } {
  if (!validUntil) return { tahap: "TANPA_BATAS", sisaHari: null }
  const sisaHari = calendarDayDiff(todayUtcMidnight, validUntil)
  if (sisaHari < 0) return { tahap: "LEWAT_BELUM_TERKIRIM", sisaHari }
  if (sisaHari <= warningDays) return { tahap: "MENIPIS", sisaHari }
  return { tahap: "TERBUKA", sisaHari }
}

const STAGE_ORDER: Record<QuotationDraftStage, number> = {
  LEWAT_BELUM_TERKIRIM: 0,
  MENIPIS: 1,
  TANPA_BATAS: 2,
  TERBUKA: 3,
}

export function buildQuotationDraftQueue(
  inputs: QuotationDraftInput[],
  now: Date = new Date(),
  warningDays: number = QUOTATION_DRAFT_EXPIRY_WARNING_DAYS,
): QuotationDraftRow[] {
  const today = getWibTodayUtcDate(now)
  const rows = inputs
    .filter((input) => input.status === "draft" && input.deletedAt === null)
    .map((input) => {
      const { tahap, sisaHari } = deriveQuotationDraftStage(input.validUntil, today, warningDays)
      return {
        ...input,
        tahap,
        tahapLabel: QUOTATION_DRAFT_STAGE_LABELS[tahap],
        sisaHari,
        umurDrafHari: ageInCalendarDays(input.createdAt, today),
      }
    })
  return rows.sort((a, b) => {
    const stageDiff = STAGE_ORDER[a.tahap] - STAGE_ORDER[b.tahap]
    if (stageDiff !== 0) return stageDiff
    if (a.tahap === "LEWAT_BELUM_TERKIRIM" || a.tahap === "MENIPIS" || a.tahap === "TERBUKA") {
      const sisaDiff = (a.sisaHari ?? 0) - (b.sisaHari ?? 0)
      if (sisaDiff !== 0) return sisaDiff
    }
    if (a.tahap === "TANPA_BATAS") {
      const createdDiff = a.createdAt.getTime() - b.createdAt.getTime()
      if (createdDiff !== 0) return createdDiff
    }
    if (a.documentNo !== b.documentNo) return a.documentNo < b.documentNo ? -1 : 1
    return a.quotationId - b.quotationId
  })
}

/** Filter default Q-QD-3: hanya tahap perlu-tindak. `semua` = semua tahap. */
export function filterQuotationDraftQueue(
  rows: QuotationDraftRow[],
  mode: "default" | "semua" = "default",
): QuotationDraftRow[] {
  if (mode === "semua") return rows
  return rows.filter((row) => row.tahap === "LEWAT_BELUM_TERKIRIM" || row.tahap === "MENIPIS")
}

/** Rekap hitungan per tahap atas populasi penuh (Q-QD-3, AC-QD-8). */
export function countQuotationDraftStages(
  rows: QuotationDraftRow[],
): Record<QuotationDraftStage, number> {
  const counts: Record<QuotationDraftStage, number> = {
    LEWAT_BELUM_TERKIRIM: 0,
    MENIPIS: 0,
    TERBUKA: 0,
    TANPA_BATAS: 0,
  }
  for (const row of rows) counts[row.tahap] += 1
  return counts
}
