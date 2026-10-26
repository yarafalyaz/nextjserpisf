/**
 * F-2026-10-26-055-S tahap 1 — antrean draf penawaran basi belum terkirim.
 *
 * Tahap TURUNAN dari `validUntil` vs hari kalender WIB — tanpa kolom
 * tersimpan, tanpa mutasi (BR-QD-01/02/05). Populasi = Quotation
 * `status = "draft"` DAN `deletedAt = null` persis (disjungsi dari antrean
 * sent F-2026-10-22-091-S). validUntil null = TANPA_BATAS jujur,
 * sisaHari null — dilarang mengarang sisa hari dari createdAt/default form
 * (BR-QD-03).
 *
 * Putusan Lead Q-QD-1/2/3/4/6 + ratifikasi Q-QD-5 (PR #965, 26 Okt 2026):
 * - Ambang MENIPIS = 3 hari (konstanta di bawah); TANPA tahap umur-basi
 *   terpisah — umur sejak createdAt hanya kolom fakta (Q-QD-1).
 * - Urutan: LEWAT_BELUM_TERKIRIM paling lama-lewat dulu, MENIPIS sisa-hari
 *   terkecil, TANPA_BATAS createdAt tertua, TERBUKA sisa-hari terkecil;
 *   seri akhir documentNo asc (Q-QD-3).
 * - Penjual kanonik = salesEmployeeId -> Employee; null tampil `—`,
 *   DILARANG fallback createdBy (Q-QD-5).
 * - Draf item-0 tampil polos; loader tidak menghitung item (Q-QD-6).
 *
 * Pure (tanpa Prisma/DOM). Loader: `quotation-draft-queue-data.ts`.
 */

import { getWibTodayUtcDate, WIB_OFFSET_HOURS } from "@/lib/utils/attendance-time"
import { safeAdd } from "@/lib/utils/math"

/** Ambang hari kalender untuk tahap MENIPIS (Q-QD-1: 3 hari). */
export const QUOTATION_DRAFT_EXPIRY_WARNING_DAYS = 3

export const QUOTATION_DRAFT_STAGES = [
  "LEWAT_BELUM_TERKIRIM",
  "MENIPIS",
  "TERBUKA",
  "TANPA_BATAS",
] as const

export type QuotationDraftStage = (typeof QUOTATION_DRAFT_STAGES)[number]

/** Label tahap verbatim Q-QD-2 — UI menempel apa adanya (AC-QD-6). */
export const QUOTATION_DRAFT_STAGE_LABELS: Record<QuotationDraftStage, string> = {
  LEWAT_BELUM_TERKIRIM: "Lewat Masa Berlaku — Belum Terkirim",
  MENIPIS: "Masa Berlaku Menipis",
  TERBUKA: "Terbuka",
  TANPA_BATAS: "Tanpa Masa Berlaku",
}

/** Judul permukaan verbatim Q-QD-2/Q-QD-4. */
export const QUOTATION_DRAFT_QUEUE_TITLE_TEXT = "Draf Penawaran Basi"

/** Notice kepala verbatim Q-QD-2 — UI menempel apa adanya. */
export const QUOTATION_DRAFT_NOTICE_TEXT =
  "Daftar ini hanya penawaran yang masih draft dan belum pernah dikirim. Draf belum menjadi penawaran ke pelanggan; kirim, revisi, atau hapus lewat detail penawaran."

const MS_PER_DAY = 86_400_000

export interface QuotationDraftInput {
  quotationId: number
  slug: string | null
  documentNo: string
  /** Status Quotation apa adanya; builder hanya menerima persis "draft". */
  status: string
  /** Quotation.deletedAt; terisi = di luar populasi (BR-QD-01). */
  deletedAt: Date | null
  customerId: number
  customerName: string
  /** Penjual kanonik salesEmployeeId -> Employee (Q-QD-5); null = tampil `—`. */
  salesEmployeeId: number | null
  salesEmployeeName: string | null
  /** Tanggal penawaran (`date`), tampil apa adanya. */
  date: Date
  validUntil: Date | null
  createdAt: Date
  grandTotal: number
}

export interface QuotationDraftRow extends QuotationDraftInput {
  tahap: QuotationDraftStage
  tahapLabel: string
  /** Hari kalender WIB sampai validUntil; negatif = hari lewat. null bila TANPA_BATAS. */
  sisaHari: number | null
  /** Hari kalender WIB sejak createdAt; fakta saja, bukan tahap (Q-QD-1). */
  umurDraftHari: number
}

export interface QuotationDraftQueue {
  rows: QuotationDraftRow[]
  /** Hitungan per tahap atas populasi PENUH, bukan subset tampil (AC-QD-8). */
  stageCounts: Record<QuotationDraftStage, number>
  totalDocuments: number
  /** Σ grandTotal baris populasi penuh; nilai draft belum ditawarkan (BR-QD-09). */
  totalGrandTotal: number
}

function calendarDayDiff(fromUtcMidnight: Date, to: Date): number {
  return Math.round((to.getTime() - fromUtcMidnight.getTime()) / MS_PER_DAY)
}

/** Tengah malam UTC hari kalender WIB dari sebuah instan. */
function wibCalendarDay(instant: Date): Date {
  const wib = new Date(instant.getTime() + WIB_OFFSET_HOURS * 3_600_000)
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()))
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
): QuotationDraftQueue {
  const today = getWibTodayUtcDate(now)
  const rows: QuotationDraftRow[] = []

  for (const input of inputs) {
    if (input.status !== "draft") continue
    if (input.deletedAt != null) continue
    const { tahap, sisaHari } = deriveQuotationDraftStage(input.validUntil, today, warningDays)
    rows.push({
      ...input,
      tahap,
      tahapLabel: QUOTATION_DRAFT_STAGE_LABELS[tahap],
      sisaHari,
      umurDraftHari: Math.max(
        0,
        Math.round((today.getTime() - wibCalendarDay(input.createdAt).getTime()) / MS_PER_DAY),
      ),
    })
  }

  rows.sort((a, b) => {
    const stageDiff = STAGE_ORDER[a.tahap] - STAGE_ORDER[b.tahap]
    if (stageDiff !== 0) return stageDiff
    if (a.tahap === "LEWAT_BELUM_TERKIRIM" || a.tahap === "MENIPIS" || a.tahap === "TERBUKA") {
      const sisaDiff = (a.sisaHari ?? 0) - (b.sisaHari ?? 0)
      if (sisaDiff !== 0) return sisaDiff
    } else {
      // TANPA_BATAS: umur createdAt tertua dulu (Q-QD-3) = createdAt menaik.
      const createdDiff = a.createdAt.getTime() - b.createdAt.getTime()
      if (createdDiff !== 0) return createdDiff
    }
    const docDiff = a.documentNo.localeCompare(b.documentNo)
    if (docDiff !== 0) return docDiff
    return a.quotationId - b.quotationId
  })

  const stageCounts: Record<QuotationDraftStage, number> = {
    LEWAT_BELUM_TERKIRIM: 0,
    MENIPIS: 0,
    TERBUKA: 0,
    TANPA_BATAS: 0,
  }
  let totalGrandTotal = 0
  for (const row of rows) {
    stageCounts[row.tahap] += 1
    totalGrandTotal = safeAdd(totalGrandTotal, row.grandTotal, 2)
  }

  return { rows, stageCounts, totalDocuments: rows.length, totalGrandTotal }
}

/** Filter default perlu-tindak (LEWAT_BELUM_TERKIRIM + MENIPIS); `semua` = semua tahap (Q-QD-3). */
export function filterQuotationDraftQueue(
  rows: QuotationDraftRow[],
  mode: "default" | "semua" = "default",
): QuotationDraftRow[] {
  if (mode === "semua") return rows
  return rows.filter((row) => row.tahap === "LEWAT_BELUM_TERKIRIM" || row.tahap === "MENIPIS")
}
