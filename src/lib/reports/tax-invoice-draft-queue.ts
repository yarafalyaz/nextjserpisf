/**
 * F-2026-10-27-098-S tahap 1 — antrean faktur pajak draft mengendap.
 *
 * Turunan murni baca-saja: populasi TaxInvoice `djpStatus = "draft"`
 * persis (BR-TIQ-01), dua ember arah out/in terpisah (BR-TIQ-02),
 * umur hari kalender WIB sejak `createdAt` (BR-TIQ-07; `updatedAt`
 * dan `taxInvoiceDate` DILARANG sebagai acuan umur).
 *
 * PUTUSAN LEAD Q-TIQ-1/2/3/5 (PR #1186 merged, 27 Okt 2026):
 * - Q-TIQ-1: mengendap >= 3 hari kalender WIB sejak createdAt;
 *   mengendap dulu lalu createdAt naik, seri id naik. Kata mengendap
 *   operasional internal, BUKAN tenggat DJP.
 * - Q-TIQ-2: ember Keluaran/Masukan, judul Faktur Pajak Draft verbatim.
 * - Q-TIQ-3: taxPeriod verbatim + penanda netral "masa lampau";
 *   kata terlambat/kewajiban/statutori DILARANG.
 * - Q-TIQ-5: gerbang create_tax_invoices, tanpa scope baris/key baru.
 *
 * BR-TIQ-03/04: nominal snapshot verbatim (tanpa hitung ulang PPN);
 * payload DILARANG memuat xmlPayload/xmlHash/djpMessage.
 * Baca-saja: antrean tidak menulis djpStatus/creditStatus (BR-TIQ-10).
 *
 * Pure (tanpa Prisma/DOM). Loader: `tax-invoice-draft-queue-data.ts`.
 */

import { getWibTodayUtcDate, WIB_OFFSET_HOURS } from "@/lib/utils/attendance-time"

/** Ambang mengendap (hari kalender WIB sejak createdAt) — Q-TIQ-1: 3. */
export const TAX_INVOICE_DRAFT_STALE_DAYS = 3

export const TAX_INVOICE_DRAFT_TITLE = "Faktur Pajak Draft"

export const TAX_INVOICE_DRAFT_DIRECTION_LABELS = {
  out: "Keluaran",
  in: "Masukan",
} as const

export type TaxInvoiceDraftDirection = keyof typeof TAX_INVOICE_DRAFT_DIRECTION_LABELS

export const TAX_INVOICE_DRAFT_LEVELS = ["mengendap", "menunggu"] as const
export type TaxInvoiceDraftLevel = (typeof TAX_INVOICE_DRAFT_LEVELS)[number]

export const TAX_INVOICE_DRAFT_LEVEL_LABELS: Record<TaxInvoiceDraftLevel, string> = {
  mengendap: "Mengendap",
  menunggu: "Menunggu",
}

export const TAX_INVOICE_DRAFT_PAST_PERIOD_LABEL = "masa lampau"

export const TAX_INVOICE_DRAFT_NOTICE_TEXT =
  "Daftar ini hanya faktur pajak yang masih draft. Status DJP hanya dari bukti Coretax; proses lewat permukaan faktur pajak yang ada."

const MS_PER_DAY = 86_400_000

export interface TaxInvoiceDraftInput {
  taxInvoiceId: number
  slug: string | null
  direction: string
  djpStatus: string
  transactionCode: string
  taxInvoiceNumber: string
  taxInvoiceDate: Date
  taxPeriod: string
  /** Snapshot tersimpan verbatim — tanpa hitung ulang. */
  dpp: unknown
  taxRate: unknown
  taxAmount: unknown
  counterpartyName: string | null
  creditStatus: string | null
  replacesId: number | null
  createdAt: Date
}

export interface TaxInvoiceDraftRow extends Omit<TaxInvoiceDraftInput, "direction" | "djpStatus"> {
  direction: TaxInvoiceDraftDirection
  directionLabel: string
  djpStatus: "draft"
  /** Hari kalender WIB sejak createdAt. */
  ageDays: number
  level: TaxInvoiceDraftLevel
  levelLabel: string
  /** taxPeriod < masa berjalan WIB (perbandingan string YYYY-MM). */
  isPastPeriod: boolean
  pastPeriodLabel: string | null
}

export interface TaxInvoiceDraftQueue {
  rows: TaxInvoiceDraftRow[]
  directionCounts: Record<TaxInvoiceDraftDirection, number>
  levelCounts: Record<TaxInvoiceDraftLevel, number>
  totalDocuments: number
  currentPeriod: string
  noticeText: string
  title: string
}

function wibCalendarDay(instant: Date): Date {
  const wib = new Date(instant.getTime() + WIB_OFFSET_HOURS * 3_600_000)
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()))
}

function wibPeriod(todayUtcMidnight: Date): string {
  const y = todayUtcMidnight.getUTCFullYear()
  const m = String(todayUtcMidnight.getUTCMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

export function buildTaxInvoiceDraftQueue(
  inputs: TaxInvoiceDraftInput[],
  now: Date = new Date(),
): TaxInvoiceDraftQueue {
  const today = getWibTodayUtcDate(now)
  const currentPeriod = wibPeriod(today)
  const rows: TaxInvoiceDraftRow[] = []

  for (const input of inputs) {
    if (input.djpStatus !== "draft") continue
    if (input.direction !== "out" && input.direction !== "in") continue
    const direction = input.direction
    const createdDay = wibCalendarDay(input.createdAt)
    const ageDays = Math.max(0, Math.round((today.getTime() - createdDay.getTime()) / MS_PER_DAY))
    const level: TaxInvoiceDraftLevel = ageDays >= TAX_INVOICE_DRAFT_STALE_DAYS ? "mengendap" : "menunggu"
    const isPastPeriod = input.taxPeriod < currentPeriod
    rows.push({
      taxInvoiceId: input.taxInvoiceId,
      slug: input.slug,
      transactionCode: input.transactionCode,
      taxInvoiceNumber: input.taxInvoiceNumber,
      taxInvoiceDate: input.taxInvoiceDate,
      taxPeriod: input.taxPeriod,
      dpp: input.dpp,
      taxRate: input.taxRate,
      taxAmount: input.taxAmount,
      counterpartyName: input.counterpartyName,
      creditStatus: input.creditStatus,
      replacesId: input.replacesId,
      createdAt: input.createdAt,
      direction,
      directionLabel: TAX_INVOICE_DRAFT_DIRECTION_LABELS[direction],
      djpStatus: "draft",
      ageDays,
      level,
      levelLabel: TAX_INVOICE_DRAFT_LEVEL_LABELS[level],
      isPastPeriod,
      pastPeriodLabel: isPastPeriod ? TAX_INVOICE_DRAFT_PAST_PERIOD_LABEL : null,
    })
  }

  const LEVEL_ORDER: Record<TaxInvoiceDraftLevel, number> = { mengendap: 0, menunggu: 1 }
  rows.sort((a, b) => {
    const levelDiff = LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]
    if (levelDiff !== 0) return levelDiff
    const createdDiff = a.createdAt.getTime() - b.createdAt.getTime()
    if (createdDiff !== 0) return createdDiff
    return a.taxInvoiceId - b.taxInvoiceId
  })

  const directionCounts: Record<TaxInvoiceDraftDirection, number> = { out: 0, in: 0 }
  const levelCounts: Record<TaxInvoiceDraftLevel, number> = { mengendap: 0, menunggu: 0 }
  for (const row of rows) {
    directionCounts[row.direction] += 1
    levelCounts[row.level] += 1
  }

  return {
    rows,
    directionCounts,
    levelCounts,
    totalDocuments: rows.length,
    currentPeriod,
    noticeText: TAX_INVOICE_DRAFT_NOTICE_TEXT,
    title: TAX_INVOICE_DRAFT_TITLE,
  }
}
