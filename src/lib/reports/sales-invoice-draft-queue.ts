/**
 * F-2026-10-26-057-S (057-B) — antrean faktur penjualan draft mengendap
 * menunggu posting.
 *
 * Turunan baca-saja dari SalesInvoice `status="draft"` + `deletedAt=null`
 * saja (BR-SIQ-01; `approved` belum-posting TIDAK ikut tahap 1 — Q-SIQ-3
 * Lead, PR #967). Faktur draft belum piutang dan belum pendapatan
 * (BR-SIQ-02): nominal tampil sebagai fakta dokumen berlabel rekap
 * "nilai draft belum terbit" (BR-SIQ-08), dilarang dijumlahkan ke
 * piutang/penagihan/jatuh tempo di permukaan mana pun. Antrean tidak
 * memposting/membatalkan/menghapus faktur apa pun (BR-SIQ-03/06/07);
 * posting tetap jalur existing dari detail faktur.
 *
 * Putusan Lead Q-SIQ (PR #967):
 * - Q-SIQ-1: `mengendap` = umur >= 3 hari kalender WIB (konstanta di
 *   bawah); di bawah itu `menunggu`.
 * - Q-SIQ-2: label/notice/kolom verbatim di bawah; UI menempel apa
 *   adanya. `dueDate` lampau pada draft TIDAK PERNAH berlabel jatuh
 *   tempo/piutang (BR-SIQ-04).
 * - Q-SIQ-3b: urutan `mengendap` dulu, lalu umur tertua; seri akhir
 *   `documentNo` asc.
 * - Q-SIQ-8: umur dari `createdAt` (momen baris masuk sistem), hari
 *   kalender WIB; `date` tampil apa adanya, `dueDate` hanya penanda
 *   rencana tagih terisi/kosong. createdAt masa depan = umur 0 tertanda,
 *   bukan negatif (EC-SIQ-4).
 * - Q-SIQ-7: status approval per baris TIDAK ditampilkan tahap 1.
 *
 * Sumber dokumen (BR-SIQ-09): urut periksa salesOrderId -> quotationId
 * -> projectId -> langsung, satu label. salesEmployeeId null tampil `—`
 * (loader memberi nama null; UI yang mengganti dengan `—`).
 *
 * Pure (tanpa Prisma/DOM). Loader: `sales-invoice-draft-queue-data.ts`.
 */

import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"
import { safeAdd } from "@/lib/utils/math"

/** Ambang umur draft (hari kalender WIB) untuk tingkat `mengendap` (Q-SIQ-1: 3). */
export const SALES_INVOICE_DRAFT_STALE_DAYS = 3

export const SALES_INVOICE_DRAFT_LEVELS = ["mengendap", "menunggu"] as const

export type SalesInvoiceDraftLevel = (typeof SALES_INVOICE_DRAFT_LEVELS)[number]

/** Label tingkat verbatim Q-SIQ-2 — UI menempel apa adanya. */
export const SALES_INVOICE_DRAFT_LEVEL_LABELS: Record<SalesInvoiceDraftLevel, string> = {
  mengendap: "Mengendap",
  menunggu: "Menunggu Posting",
}

/** Notice kepala verbatim Q-SIQ-2 — UI menempel apa adanya. */
export const SALES_INVOICE_DRAFT_NOTICE_TEXT =
  "Daftar ini hanya faktur penjualan yang masih draft dan belum diposting. Draft belum menjadi tagihan dan belum dihitung sebagai piutang sampai diposting lewat detail faktur."

/** Label rekap nominal verbatim Q-SIQ-2/BR-SIQ-08 — bukan piutang/tagihan/pendapatan. */
export const SALES_INVOICE_DRAFT_TOTAL_LABEL = "nilai draft belum terbit"

/** Penanda pendamping baris tanpa dueDate, verbatim Q-SIQ-2 (bukan tingkat). */
export const SALES_INVOICE_DRAFT_NO_DUE_DATE_TEXT = "Jatuh tempo belum diisi"

/** Judul kolom verbatim Q-SIQ-2. */
export const SALES_INVOICE_DRAFT_COLUMN_LABELS = {
  umur: "Menunggu Posting",
  dueDate: "Rencana Jatuh Tempo",
  sumber: "Sumber",
} as const

const MS_PER_DAY = 86_400_000

export interface SalesInvoiceDraftInput {
  invoiceId: number
  slug: string | null
  documentNo: string
  /** Status tersimpan apa adanya; builder hanya menerima persis "draft". */
  status: string
  /** deletedAt terisi = di luar populasi (BR-SIQ-01). */
  deletedAt: Date | null
  customerId: number
  customerName: string
  /** Penjual `salesEmployeeId`; null = tampil `—`. */
  salesEmployeeId: number | null
  salesEmployeeName: string | null
  /** Tautan sumber (BR-SIQ-09); nomor dokumen sumber diisi loader bila tertaut. */
  salesOrderId: number | null
  salesOrderNo: string | null
  quotationId: number | null
  quotationNo: string | null
  projectId: number | null
  /** Tanggal faktur (`date`), tampil apa adanya. */
  date: Date
  /** Rencana jatuh tempo; hanya penanda terisi/kosong, tidak dinilai lewat. */
  dueDate: Date | null
  /** Momen draft masuk sistem; acuan umur (Q-SIQ-8). */
  createdAt: Date
  grandTotal: number
}

export interface SalesInvoiceDraftRow extends SalesInvoiceDraftInput {
  tingkat: SalesInvoiceDraftLevel
  tingkatLabel: string
  /** Hari kalender WIB sejak createdAt; masa depan = 0. */
  umurDraftHari: number
  /** Penanda rencana tagih terisi (dueDate != null); bukan kelewatan. */
  punyaRencanaJatuhTempo: boolean
  /** Satu label sumber verbatim pola Q-SIQ-2. */
  sumberLabel: string
}

function calendarDayDiff(fromUtcMidnight: Date, to: Date): number {
  return Math.round((to.getTime() - fromUtcMidnight.getTime()) / MS_PER_DAY)
}

/** Umur hari kalender WIB dari createdAt; masa depan = 0, bukan negatif. */
export function salesInvoiceDraftAgeDays(createdAt: Date, todayUtcMidnight: Date): number {
  return Math.max(0, -calendarDayDiff(todayUtcMidnight, createdAt))
}

export function deriveSalesInvoiceDraftLevel(
  umurDraftHari: number,
  staleDays: number = SALES_INVOICE_DRAFT_STALE_DAYS,
): SalesInvoiceDraftLevel {
  return umurDraftHari >= staleDays ? "mengendap" : "menunggu"
}

/** Label sumber: urut periksa SO -> penawaran -> proyek -> langsung (BR-SIQ-09). */
export function salesInvoiceDraftSourceLabel(input: {
  salesOrderNo: string | null
  quotationNo: string | null
  projectId: number | null
}): string {
  if (input.salesOrderNo) return `Dari Pesanan ${input.salesOrderNo}`
  if (input.quotationNo) return `Dari Penawaran ${input.quotationNo}`
  if (input.projectId != null) return "Proyek"
  return "Langsung"
}

const LEVEL_ORDER: Record<SalesInvoiceDraftLevel, number> = {
  mengendap: 0,
  menunggu: 1,
}

export function buildSalesInvoiceDraftQueue(
  inputs: SalesInvoiceDraftInput[],
  now: Date = new Date(),
  staleDays: number = SALES_INVOICE_DRAFT_STALE_DAYS,
): SalesInvoiceDraftRow[] {
  const today = getWibTodayUtcDate(now)
  const rows = inputs
    .filter((input) => input.status === "draft" && input.deletedAt === null)
    .map((input) => {
      const umurDraftHari = salesInvoiceDraftAgeDays(input.createdAt, today)
      const tingkat = deriveSalesInvoiceDraftLevel(umurDraftHari, staleDays)
      return {
        ...input,
        tingkat,
        tingkatLabel: SALES_INVOICE_DRAFT_LEVEL_LABELS[tingkat],
        umurDraftHari,
        punyaRencanaJatuhTempo: input.dueDate != null,
        sumberLabel: salesInvoiceDraftSourceLabel(input),
      }
    })
  return rows.sort((a, b) => {
    const levelDiff = LEVEL_ORDER[a.tingkat] - LEVEL_ORDER[b.tingkat]
    if (levelDiff !== 0) return levelDiff
    const createdDiff = a.createdAt.getTime() - b.createdAt.getTime()
    if (createdDiff !== 0) return createdDiff
    if (a.documentNo !== b.documentNo) return a.documentNo < b.documentNo ? -1 : 1
    return a.invoiceId - b.invoiceId
  })
}

export interface SalesInvoiceDraftSummary {
  totalDocuments: number
  mengendapCount: number
  menungguCount: number
  /** Σ grandTotal baris antrean; labelnya SALES_INVOICE_DRAFT_TOTAL_LABEL. */
  totalGrandTotal: number
  totalLabel: string
}

/** Rekap atas baris builder yang sama persis (AC-SIQ-B5). */
export function summarizeSalesInvoiceDraftQueue(
  rows: SalesInvoiceDraftRow[],
): SalesInvoiceDraftSummary {
  return {
    totalDocuments: rows.length,
    mengendapCount: rows.filter((r) => r.tingkat === "mengendap").length,
    menungguCount: rows.filter((r) => r.tingkat === "menunggu").length,
    totalGrandTotal: rows.reduce((sum, r) => safeAdd(sum, r.grandTotal, 2), 0),
    totalLabel: SALES_INVOICE_DRAFT_TOTAL_LABEL,
  }
}
