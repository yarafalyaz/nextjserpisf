/**
 * F-2026-10-22-091-S tahap 1 — antrean penawaran terkirim belum dijawab.
 *
 * Tahap urgensi TURUNAN dari `validUntil` vs hari kalender WIB — tanpa
 * kolom tersimpan, tanpa mutasi status/validUntil/dokumen/jurnal
 * (BR-QF-01/05). Semantik kedaluwarsa persis guard server
 * `assertQuotationNotExpired` (src/actions/sales.actions.ts:73-78,
 * BR-QF-02): lewat bila hari WIB hari ini > validUntil; validUntil
 * sendiri masih berlaku. validUntil kosong = tahap TANPA_BATAS jujur,
 * sisaHari null — dilarang mengarang sisa hari (BR-QF-03).
 *
 * Ambang MENIPIS = konstanta bernama di bawah (BR-QF-07): usulan BOT 5
 * 3 hari kalender; putusan final Q-QF-1 BOT 1 belum terbit saat modul
 * ini ditulis — ubah SATU konstanta ini bila putusan berbeda.
 *
 * Pure (tanpa Prisma/DOM). Loader: `quotation-followup-queue-data.ts`.
 * Urutan final Q-QF-3 BOT 1 belum terbit; dipakai urutan usulan spec §1:
 * KEDALUWARSA paling lama dulu, MENIPIS sisa-hari terkecil, TANPA_BATAS
 * tanggal kirim tertua, TERBUKA sisa-hari terkecil (hanya filter "semua").
 */

import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

/** Ambang hari kalender untuk tahap MENIPIS (Q-QF-1, usulan 3 hari). */
export const QUOTATION_EXPIRY_WARNING_DAYS = 3

export const QUOTATION_FOLLOWUP_STAGES = [
  "KEDALUWARSA",
  "MENIPIS",
  "TERBUKA",
  "TANPA_BATAS",
] as const

export type QuotationFollowUpStage = (typeof QUOTATION_FOLLOWUP_STAGES)[number]

/** Label tahap verbatim spec §6 — UI menempel apa adanya (AC-QF-10). */
export const QUOTATION_FOLLOWUP_STAGE_LABELS: Record<QuotationFollowUpStage, string> = {
  KEDALUWARSA: "Kedaluwarsa",
  MENIPIS: "Masa Berlaku Menipis",
  TERBUKA: "Terbuka",
  TANPA_BATAS: "Tanpa Masa Berlaku",
}

/** Notice jujur verbatim spec §6 — UI menempel apa adanya. */
export const QUOTATION_FOLLOWUP_NOTICE_TEXT =
  "Tahap dihitung dari masa berlaku penawaran terkirim. Penawaran kedaluwarsa tidak dapat diterima sebelum direvisi atau diperpanjang masa berlakunya."

const MS_PER_DAY = 86_400_000

export interface QuotationFollowUpInput {
  quotationId: number
  slug: string | null
  documentNo: string
  customerId: number
  customerName: string
  /** Kontak pelanggan — hanya untuk antrean berizin; ekspor tanpa ini (Q-QF-4). */
  phone: string | null
  contactPerson: string | null
  /** Penjual tercatat; null = belum ada penjual (tampil `—`, AC-QF-11). */
  salesEmployeeId: number | null
  salesEmployeeName: string | null
  /** Tanggal penawaran (`date`); acuan umur terkirim. */
  date: Date
  validUntil: Date | null
  grandTotal: number
}

export interface QuotationFollowUpRow extends QuotationFollowUpInput {
  tahap: QuotationFollowUpStage
  tahapLabel: string
  /** Hari kalender WIB sampai validUntil; negatif = hari lewat. null bila TANPA_BATAS. */
  sisaHari: number | null
  /** Hari kalender WIB sejak tanggal penawaran. */
  umurTerkirimHari: number
}

function calendarDayDiff(fromUtcMidnight: Date, to: Date): number {
  return Math.round((to.getTime() - fromUtcMidnight.getTime()) / MS_PER_DAY)
}

export function deriveQuotationFollowUpStage(
  validUntil: Date | null,
  todayUtcMidnight: Date,
  warningDays: number = QUOTATION_EXPIRY_WARNING_DAYS,
): { tahap: QuotationFollowUpStage; sisaHari: number | null } {
  if (!validUntil) return { tahap: "TANPA_BATAS", sisaHari: null }
  const sisaHari = calendarDayDiff(todayUtcMidnight, validUntil)
  if (sisaHari < 0) return { tahap: "KEDALUWARSA", sisaHari }
  if (sisaHari <= warningDays) return { tahap: "MENIPIS", sisaHari }
  return { tahap: "TERBUKA", sisaHari }
}

const STAGE_ORDER: Record<QuotationFollowUpStage, number> = {
  KEDALUWARSA: 0,
  MENIPIS: 1,
  TANPA_BATAS: 2,
  TERBUKA: 3,
}

export function buildQuotationFollowUpQueue(
  inputs: QuotationFollowUpInput[],
  now: Date = new Date(),
  warningDays: number = QUOTATION_EXPIRY_WARNING_DAYS,
): QuotationFollowUpRow[] {
  const today = getWibTodayUtcDate(now)
  const rows = inputs.map((input) => {
    const { tahap, sisaHari } = deriveQuotationFollowUpStage(input.validUntil, today, warningDays)
    return {
      ...input,
      tahap,
      tahapLabel: QUOTATION_FOLLOWUP_STAGE_LABELS[tahap],
      sisaHari,
      umurTerkirimHari: Math.max(0, calendarDayDiff(today, input.date) * -1),
    }
  })
  return rows.sort((a, b) => {
    const stageDiff = STAGE_ORDER[a.tahap] - STAGE_ORDER[b.tahap]
    if (stageDiff !== 0) return stageDiff
    if (a.tahap === "KEDALUWARSA") return (a.sisaHari ?? 0) - (b.sisaHari ?? 0)
    if (a.tahap === "MENIPIS" || a.tahap === "TERBUKA") return (a.sisaHari ?? 0) - (b.sisaHari ?? 0)
    // TANPA_BATAS: tanggal kirim tertua dulu.
    const dateDiff = a.date.getTime() - b.date.getTime()
    if (dateDiff !== 0) return dateDiff
    return a.quotationId - b.quotationId
  })
}

/** Filter default antrean spec §1: tanpa TERBUKA. `semua` = semua tahap. */
export function filterQuotationFollowUpQueue(
  rows: QuotationFollowUpRow[],
  mode: "default" | "semua" = "default",
): QuotationFollowUpRow[] {
  if (mode === "semua") return rows
  return rows.filter((row) => row.tahap !== "TERBUKA")
}
