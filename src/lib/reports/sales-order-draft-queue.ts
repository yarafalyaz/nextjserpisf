/**
 * F-2026-10-26-056-S tahap 1 — antrean Pesanan Penjualan draft mengendap.
 *
 * Turunan murni baca-saja: populasi SalesOrder `status = "draft"` DAN
 * `deletedAt = null` persis (BR-SOQ-01); draft belum bisa dikirim dan
 * belum pesanan berjalan (BR-SOQ-02). Umur = hari kalender WIB sejak
 * `createdAt` (Q-SOQ-6 diratifikasi); `date` tampil apa adanya,
 * `deliveryDate` hanya penanda terisi/kosong — TIDAK dinilai lewat di
 * populasi draft (penilaian janji wilayah 029-S sesudah disetujui,
 * BR-SOQ-06).
 *
 * Putusan Lead Q-SOQ-1..6 (PR #966, 26 Okt 2026):
 * - Ambang `mengendap` = umur >= 7 hari kalender WIB (konstanta di bawah).
 * - Label/notice/kolom verbatim Q-SOQ-2; urutan `mengendap` dulu lalu
 *   umur tertua, seri documentNo asc (Q-SOQ-3).
 * - Tanpa setujui/batal dari antrean (Q-SOQ-4); tanpa key izin baru
 *   (Q-SOQ-5, loader reuse `view_sales_orders`).
 *
 * Pure (tanpa Prisma/DOM). Loader: `sales-order-draft-queue-data.ts`.
 */

import { getWibTodayUtcDate, WIB_OFFSET_HOURS } from "@/lib/utils/attendance-time"
import { safeAdd } from "@/lib/utils/math"

/** Ambang umur draft (hari kalender WIB) untuk tingkat `mengendap` (Q-SOQ-1: 7). */
export const SALES_ORDER_DRAFT_STALE_DAYS = 7

export const SALES_ORDER_DRAFT_LEVELS = ["mengendap", "menunggu"] as const

export type SalesOrderDraftLevel = (typeof SALES_ORDER_DRAFT_LEVELS)[number]

/** Label tingkat verbatim Q-SOQ-2 — UI menempel apa adanya. */
export const SALES_ORDER_DRAFT_LEVEL_LABELS: Record<SalesOrderDraftLevel, string> = {
  mengendap: "Mengendap",
  menunggu: "Menunggu Persetujuan",
}

/** Judul permukaan verbatim Q-SOQ-2. */
export const SALES_ORDER_DRAFT_QUEUE_TITLE_TEXT = "Pesanan Draft Mengendap"

/** Judul kolom verbatim Q-SOQ-2. */
export const SALES_ORDER_DRAFT_AGE_COLUMN_TEXT = "Menunggu Persetujuan"
export const SALES_ORDER_DRAFT_DELIVERY_COLUMN_TEXT = "Janji Kirim"

/** Penanda pendamping baris tanpa deliveryDate (BR-SOQ-06; bukan tingkat). */
export const SALES_ORDER_DRAFT_NO_DELIVERY_DATE_TEXT = "Janji kirim belum diisi"

/** Label asal verbatim Q-SOQ-2; nomor penawaran ditempel sesudah label ini. */
export const SALES_ORDER_DRAFT_FROM_QUOTATION_TEXT = "Dari Penawaran"
export const SALES_ORDER_DRAFT_DIRECT_TEXT = "Langsung"

/** Label rekap Σ verbatim BR-SOQ-09 — dilarang berlabel pesanan/pendapatan/komitmen. */
export const SALES_ORDER_DRAFT_TOTAL_LABEL_TEXT = "nilai draft belum disetujui"

/** Notice verbatim Q-SOQ-2 — UI menempel apa adanya. */
export const SALES_ORDER_DRAFT_NOTICE_TEXT =
  "Daftar ini hanya pesanan penjualan yang masih draft dan belum disetujui. Draft belum bisa dikirim dan belum dihitung sebagai pesanan berjalan sampai disetujui lewat detail pesanan."

const MS_PER_DAY = 86_400_000

export interface SalesOrderDraftInput {
  salesOrderId: number
  slug: string | null
  documentNo: string
  /** Status SalesOrder apa adanya; builder hanya menerima persis "draft". */
  status: string
  /** SalesOrder.deletedAt; terisi = di luar populasi (BR-SOQ-01). */
  deletedAt: Date | null
  customerId: number
  customerName: string
  /** Asal penawaran tertaut; null = langsung (BR-SOQ-07). */
  quotationId: number | null
  quotationDocumentNo: string | null
  /** Penjual tercatat; null tampil `—` (BR-SOQ-07). */
  salesEmployeeId: number | null
  salesEmployeeName: string | null
  /** Tanggal pesanan (`date`), tampil apa adanya. */
  date: Date
  /** Janji kirim; hanya penanda terisi/kosong di populasi draft (BR-SOQ-06). */
  deliveryDate: Date | null
  createdAt: Date
  grandTotal: number
}

export interface SalesOrderDraftRow extends SalesOrderDraftInput {
  tingkat: SalesOrderDraftLevel
  tingkatLabel: string
  /** Hari kalender WIB sejak createdAt; masa depan = 0 (EC-SOQ-4). */
  umurDraftHari: number
  /** createdAt sesudah hari laporan (jam server) — umur ditahan 0. */
  umurDariMasaDepan: boolean
  punyaJanji: boolean
  dariPenawaran: boolean
  /** Label asal siap tampil: "Dari Penawaran <no>" / "Langsung". */
  asalLabel: string
}

export interface SalesOrderDraftQueue {
  rows: SalesOrderDraftRow[]
  /** Hitungan per tingkat atas baris tampil (populasi penuh antrean ini). */
  levelCounts: Record<SalesOrderDraftLevel, number>
  totalDocuments: number
  /** Σ grandTotal baris antrean; label verbatim SALES_ORDER_DRAFT_TOTAL_LABEL_TEXT. */
  totalGrandTotal: number
}

/** Tengah malam UTC hari kalender WIB dari sebuah instan. */
function wibCalendarDay(instant: Date): Date {
  const wib = new Date(instant.getTime() + WIB_OFFSET_HOURS * 3_600_000)
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()))
}

export function deriveSalesOrderDraftAge(
  createdAt: Date,
  todayUtcMidnight: Date,
): { umurDraftHari: number; umurDariMasaDepan: boolean } {
  const createdDay = wibCalendarDay(createdAt)
  const diff = Math.round((todayUtcMidnight.getTime() - createdDay.getTime()) / MS_PER_DAY)
  return { umurDraftHari: Math.max(0, diff), umurDariMasaDepan: diff < 0 }
}

export function buildSalesOrderDraftQueue(
  inputs: SalesOrderDraftInput[],
  now: Date = new Date(),
  staleDays: number = SALES_ORDER_DRAFT_STALE_DAYS,
): SalesOrderDraftQueue {
  const today = getWibTodayUtcDate(now)
  const rows: SalesOrderDraftRow[] = []

  for (const input of inputs) {
    if (input.status !== "draft") continue
    if (input.deletedAt != null) continue
    const { umurDraftHari, umurDariMasaDepan } = deriveSalesOrderDraftAge(input.createdAt, today)
    const tingkat: SalesOrderDraftLevel = umurDraftHari >= staleDays ? "mengendap" : "menunggu"
    const dariPenawaran = input.quotationId != null
    rows.push({
      ...input,
      tingkat,
      tingkatLabel: SALES_ORDER_DRAFT_LEVEL_LABELS[tingkat],
      umurDraftHari,
      umurDariMasaDepan,
      punyaJanji: input.deliveryDate != null,
      dariPenawaran,
      asalLabel: dariPenawaran
        ? input.quotationDocumentNo
          ? `${SALES_ORDER_DRAFT_FROM_QUOTATION_TEXT} ${input.quotationDocumentNo}`
          : SALES_ORDER_DRAFT_FROM_QUOTATION_TEXT
        : SALES_ORDER_DRAFT_DIRECT_TEXT,
    })
  }

  const LEVEL_ORDER: Record<SalesOrderDraftLevel, number> = { mengendap: 0, menunggu: 1 }
  rows.sort((a, b) => {
    const levelDiff = LEVEL_ORDER[a.tingkat] - LEVEL_ORDER[b.tingkat]
    if (levelDiff !== 0) return levelDiff
    // Dalam tingkat: umur tertua dulu = createdAt menaik (Q-SOQ-3).
    const createdDiff = a.createdAt.getTime() - b.createdAt.getTime()
    if (createdDiff !== 0) return createdDiff
    const docDiff = a.documentNo.localeCompare(b.documentNo)
    if (docDiff !== 0) return docDiff
    return a.salesOrderId - b.salesOrderId
  })

  const levelCounts: Record<SalesOrderDraftLevel, number> = { mengendap: 0, menunggu: 0 }
  let totalGrandTotal = 0
  for (const row of rows) {
    levelCounts[row.tingkat] += 1
    totalGrandTotal = safeAdd(totalGrandTotal, row.grandTotal, 2)
  }

  return { rows, levelCounts, totalDocuments: rows.length, totalGrandTotal }
}
