/**
 * F-2026-10-26-060-S tahap 1 — antrean Pesanan Pembelian draft mengendap
 * menunggu persetujuan.
 *
 * Turunan murni baca-saja: populasi PurchaseOrder `status = "draft"` DAN
 * `deletedAt = null` persis (BR-POQ-01). Nilai baris = grandTotal
 * tersimpan verbatim berlabel "nilai draft belum disetujui" (BR-POQ-03 —
 * draft belum utang, belum komitmen bayar). `expectedDate` hanya penanda
 * rencana terima, TIDAK dinilai terlambat/jatuh tempo (BR-POQ-04).
 * Sumber baris satu label turunan urut periksa: purchaseRequestId ->
 * workOrderId/isService -> langsung (BR-POQ-05); PO jasa tetap tampil
 * dengan label sumbernya (BR-POQ-09).
 *
 * Gerbang: putusan Lead Q-POQ-1/2/3 BELUM tertanam di backlog main.
 * Backend menanam lapis aman pola preseden keluarga antrean draft yang
 * sudah diputus Lead 2026-10-26 19:10 WIB (Q-PDQ-1/Q-MRQ-1/Q-VPQ-1 +
 * contoh 059-S): ambang `mengendap` = umur >= 3 hari kalender WIB dari
 * `createdAt` (== termasuk), satu konstanta bernama di bawah; urutan
 * mengendap dulu, tertua, `documentNo` asc. Kata judul/label di sini
 * PELAPIS PROVISIONAL (judul usulan Q-POQ-2 "Pesanan Pembelian Draft
 * Mengendap" + frasa Σ wajib BR-POQ-03) — bukan kata §1 yang disahkan;
 * ratifikasi Q-POQ-2 boleh mengganti konstanta tanpa mengubah bentuk
 * payload.
 *
 * Pure (tanpa Prisma/DOM). Loader: `purchase-order-draft-queue-data.ts`.
 */

import { getWibTodayUtcDate, WIB_OFFSET_HOURS } from "@/lib/utils/attendance-time"
import { safeAdd } from "@/lib/utils/math"

/**
 * Ambang umur draft (hari kalender WIB) untuk tingkat `mengendap`.
 * Preseden keluarga diputus Lead 2026-10-26 (3 hari); Q-POQ-1 PO sendiri
 * belum diputus — ganti konstanta ini bila putusan berbeda.
 */
export const PURCHASE_ORDER_DRAFT_STALE_DAYS = 3

export const PURCHASE_ORDER_DRAFT_LEVELS = ["mengendap", "menunggu"] as const

export type PurchaseOrderDraftLevel = (typeof PURCHASE_ORDER_DRAFT_LEVELS)[number]

/** Label tingkat — UI menempel apa adanya. */
export const PURCHASE_ORDER_DRAFT_LEVEL_LABELS: Record<PurchaseOrderDraftLevel, string> = {
  mengendap: "Mengendap",
  menunggu: "Menunggu Persetujuan",
}

/** Judul permukaan (usulan Q-POQ-2, provisional sampai diratifikasi). */
export const PURCHASE_ORDER_DRAFT_QUEUE_TITLE_TEXT = "Pesanan Pembelian Draft Mengendap"

/** Judul kolom. */
export const PURCHASE_ORDER_DRAFT_COLUMN_LABELS = {
  documentNo: "No. Dokumen",
  vendor: "Vendor",
  source: "Sumber",
  value: "Nilai Draft",
  expectedDate: "Rencana Terima",
  age: "Menunggu Persetujuan",
  createdBy: "Dibuat Oleh",
} as const

/** Penanda pendamping baris tanpa expectedDate (BR-POQ-04, EC-POQ-4). */
export const PURCHASE_ORDER_DRAFT_NO_EXPECTED_DATE_TEXT = "Rencana terima belum diisi"

/** Label sumber verbatim BR-POQ-05 — satu label per baris. */
export const PURCHASE_ORDER_DRAFT_FROM_REQUEST_TEXT = "Permintaan Pembelian"
export const PURCHASE_ORDER_DRAFT_FROM_WORK_ORDER_TEXT = "Perintah Kerja"
export const PURCHASE_ORDER_DRAFT_DIRECT_TEXT = "Langsung"

/** Label rekap Σ verbatim BR-POQ-03 — dilarang berlabel utang/komitmen. */
export const PURCHASE_ORDER_DRAFT_TOTAL_LABEL_TEXT = "nilai draft belum disetujui"

/** Notice — UI menempel apa adanya (provisional sampai Q-POQ-2). */
export const PURCHASE_ORDER_DRAFT_NOTICE_TEXT =
  "Daftar ini hanya pesanan pembelian yang masih draft dan belum disetujui. Nilai draft belum disetujui, belum menjadi utang dan belum menjadi komitmen bayar; setujui, ubah, atau batalkan lewat detail pesanan."

const MS_PER_DAY = 86_400_000

export interface PurchaseOrderDraftInput {
  purchaseOrderId: number
  slug: string | null
  documentNo: string
  /** Status PurchaseOrder apa adanya; builder hanya menerima persis "draft". */
  status: string
  /** PurchaseOrder.deletedAt; terisi = di luar populasi (BR-POQ-01). */
  deletedAt: Date | null
  vendorId: number
  /** Nama vendor saja (BR-POQ-08); null tampil `—` oleh UI (EC-POQ-3). */
  vendorName: string | null
  /** Sumber urut periksa BR-POQ-05: PR dulu, lalu WO/jasa, lalu langsung. */
  purchaseRequestId: number | null
  purchaseRequestDocumentNo: string | null
  workOrderId: number | null
  workOrderDocumentNo: string | null
  isService: boolean
  /** Tanggal pesanan (`date`), tampil apa adanya. */
  date: Date
  /** Rencana terima; hanya penanda terisi/kosong, tidak dinilai (BR-POQ-04). */
  expectedDate: Date | null
  /** PurchaseOrder.createdBy = User.id; nama diselesaikan loader massal. */
  createdByName: string | null
  createdAt: Date
  grandTotal: number
}

export interface PurchaseOrderDraftRow extends PurchaseOrderDraftInput {
  tingkat: PurchaseOrderDraftLevel
  tingkatLabel: string
  /** Hari kalender WIB sejak createdAt; masa depan = 0 (BR-POQ-10). */
  umurDraftHari: number
  /** createdAt sesudah hari laporan (jam server) — umur ditahan 0. */
  umurDariMasaDepan: boolean
  punyaRencanaTerima: boolean
  /** Satu label sumber turunan (BR-POQ-05): nomor dokumen ditempel sesudahnya bila ada. */
  sumberLabel: string
}

export interface PurchaseOrderDraftQueue {
  rows: PurchaseOrderDraftRow[]
  /** Hitungan per tingkat atas baris tampil (populasi penuh antrean ini). */
  levelCounts: Record<PurchaseOrderDraftLevel, number>
  totalDocuments: number
  /** Σ grandTotal baris antrean; label verbatim PURCHASE_ORDER_DRAFT_TOTAL_LABEL_TEXT. */
  totalGrandTotal: number
  totalLabel: string
}

/** Tengah malam UTC hari kalender WIB dari sebuah instan. */
function wibCalendarDay(instant: Date): Date {
  const wib = new Date(instant.getTime() + WIB_OFFSET_HOURS * 3_600_000)
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()))
}

export function derivePurchaseOrderDraftAge(
  createdAt: Date,
  todayUtcMidnight: Date,
): { umurDraftHari: number; umurDariMasaDepan: boolean } {
  const createdDay = wibCalendarDay(createdAt)
  const diff = Math.round((todayUtcMidnight.getTime() - createdDay.getTime()) / MS_PER_DAY)
  return { umurDraftHari: Math.max(0, diff), umurDariMasaDepan: diff < 0 }
}

/** Sumber baris: PR menang atas WO; jasa tanpa WO tetap label WO (BR-POQ-05/09). */
export function derivePurchaseOrderDraftSource(input: {
  purchaseRequestId: number | null
  purchaseRequestDocumentNo: string | null
  workOrderId: number | null
  workOrderDocumentNo: string | null
  isService: boolean
}): string {
  if (input.purchaseRequestId != null) {
    return input.purchaseRequestDocumentNo
      ? `${PURCHASE_ORDER_DRAFT_FROM_REQUEST_TEXT} ${input.purchaseRequestDocumentNo}`
      : PURCHASE_ORDER_DRAFT_FROM_REQUEST_TEXT
  }
  if (input.workOrderId != null || input.isService) {
    return input.workOrderDocumentNo
      ? `${PURCHASE_ORDER_DRAFT_FROM_WORK_ORDER_TEXT} ${input.workOrderDocumentNo}`
      : PURCHASE_ORDER_DRAFT_FROM_WORK_ORDER_TEXT
  }
  return PURCHASE_ORDER_DRAFT_DIRECT_TEXT
}

export function buildPurchaseOrderDraftQueue(
  inputs: PurchaseOrderDraftInput[],
  now: Date = new Date(),
  staleDays: number = PURCHASE_ORDER_DRAFT_STALE_DAYS,
): PurchaseOrderDraftQueue {
  const today = getWibTodayUtcDate(now)
  const rows: PurchaseOrderDraftRow[] = []

  for (const input of inputs) {
    if (input.status !== "draft") continue
    if (input.deletedAt != null) continue
    const { umurDraftHari, umurDariMasaDepan } = derivePurchaseOrderDraftAge(input.createdAt, today)
    const tingkat: PurchaseOrderDraftLevel = umurDraftHari >= staleDays ? "mengendap" : "menunggu"
    rows.push({
      ...input,
      tingkat,
      tingkatLabel: PURCHASE_ORDER_DRAFT_LEVEL_LABELS[tingkat],
      umurDraftHari,
      umurDariMasaDepan,
      punyaRencanaTerima: input.expectedDate != null,
      sumberLabel: derivePurchaseOrderDraftSource(input),
    })
  }

  const LEVEL_ORDER: Record<PurchaseOrderDraftLevel, number> = { mengendap: 0, menunggu: 1 }
  rows.sort((a, b) => {
    const levelDiff = LEVEL_ORDER[a.tingkat] - LEVEL_ORDER[b.tingkat]
    if (levelDiff !== 0) return levelDiff
    // Dalam tingkat: umur tertua dulu = createdAt menaik (BR-POQ-06).
    const createdDiff = a.createdAt.getTime() - b.createdAt.getTime()
    if (createdDiff !== 0) return createdDiff
    const docDiff = a.documentNo.localeCompare(b.documentNo)
    if (docDiff !== 0) return docDiff
    return a.purchaseOrderId - b.purchaseOrderId
  })

  const levelCounts: Record<PurchaseOrderDraftLevel, number> = { mengendap: 0, menunggu: 0 }
  let totalGrandTotal = 0
  for (const row of rows) {
    levelCounts[row.tingkat] += 1
    totalGrandTotal = safeAdd(totalGrandTotal, row.grandTotal, 2)
  }

  return {
    rows,
    levelCounts,
    totalDocuments: rows.length,
    totalGrandTotal,
    totalLabel: PURCHASE_ORDER_DRAFT_TOTAL_LABEL_TEXT,
  }
}
