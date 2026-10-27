/**
 * F-2026-10-26-072-S tahap 1 — antrean pembayaran vendor draft
 * mengendap belum dikonfirmasi.
 *
 * Turunan murni baca-saja: populasi VendorPayment `status = "draft"`
 * persis AND deletedAt null (BR-VPQ-01). Pembayaran draft BELUM
 * membayar apa pun: nol jurnal, nol kas keluar, nol alokasi, nol
 * pengurang utang vendor sampai confirmVendorPayment existing
 * berjalan (BR-VPQ-02). `amount` tampil verbatim berlabel nilai draft
 * belum dibayar; adminFee TIDAK masuk payload sama sekali — biaya
 * bank baru lahir saat jurnal konfirmasi (BR-VPQ-04).
 *
 * PUTUSAN LEAD Q-VPQ-1/2 (backlog origin/main, 26 Okt 2026 19:10 WIB):
 * - Q-VPQ-1: ambang `mengendap` = umur >= 3 hari kalender WIB sejak
 *   `createdAt`; == ambang termasuk mengendap (konstanta di bawah).
 *   Acuan BUKAN `paymentDate` (BR-VPQ-06).
 * - Q-VPQ-2: label/notice/kolom verbatim §1 spec — satu konstanta label
 *   server; UI menempel apa adanya. Label rekap nilai wajib memuat
 *   frasa "belum dibayar": `nilai draft belum dibayar` menempel di
 *   setiap Σ amount.
 * - Q-VPQ-5 tertanam: urutan mengendap dulu lalu umur tertua, seri
 *   documentNo asc.
 *
 * paymentDateLampau = penanda pendamping fakta tanggal rencana bayar,
 * BUKAN tingkat dan BUKAN tunggakan (BR-VPQ-06).
 *
 * Pure (tanpa Prisma/DOM). Loader: `vendor-payment-draft-queue-data.ts`.
 */

import { getWibTodayUtcDate, WIB_OFFSET_HOURS } from "@/lib/utils/attendance-time"

/** Ambang umur draft (hari kalender WIB) untuk tingkat `mengendap` (Q-VPQ-1: 3). */
export const VENDOR_PAYMENT_DRAFT_STALE_DAYS = 3

export const VENDOR_PAYMENT_DRAFT_LEVELS = ["mengendap", "menunggu"] as const

export type VendorPaymentDraftLevel = (typeof VENDOR_PAYMENT_DRAFT_LEVELS)[number]

/** Label tingkat verbatim Q-VPQ-2 — UI menempel apa adanya. */
export const VENDOR_PAYMENT_DRAFT_LEVEL_LABELS: Record<VendorPaymentDraftLevel, string> = {
  mengendap: "Mengendap",
  menunggu: "Menunggu Konfirmasi",
}

/** Judul kolom verbatim Q-VPQ-2. */
export const VENDOR_PAYMENT_DRAFT_COLUMN_LABELS = {
  documentNo: "No. Dokumen",
  vendor: "Pemasok",
  amount: "Nilai Draft",
  paymentDate: "Tanggal Bayar",
  vendorBill: "Tagihan Tujuan",
  age: "Menunggu",
  createdBy: "Dibuat Oleh",
} as const

/** Label rekap Σ amount verbatim Q-VPQ-2 — wajib menempel di setiap Σ amount. */
export const VENDOR_PAYMENT_DRAFT_TOTAL_LABEL = "nilai draft belum dibayar"

/** Notice verbatim Q-VPQ-2 — UI menempel apa adanya. */
export const VENDOR_PAYMENT_DRAFT_NOTICE_TEXT =
  "Daftar ini hanya pembayaran vendor yang masih draft dan belum dikonfirmasi. Pembayaran draft belum mengeluarkan kas dan belum mengurangi tagihan vendor; konfirmasi, ubah, atau hapus lewat detail pembayaran."

const MS_PER_DAY = 86_400_000

export interface VendorPaymentDraftInput {
  vendorPaymentId: number
  slug: string | null
  documentNo: string
  /** Status VendorPayment apa adanya; builder hanya menerima persis "draft". */
  status: string
  /** Terhapus lunak; builder menolak deletedAt terisi (BR-VPQ-01). */
  deletedAt: Date | null
  vendorId: number
  vendorName: string
  /** amount tersimpan apa adanya (Decimal→Number di tepi loader). */
  amount: number
  /** Tanggal bayar yang direncanakan/diinput — BUKAN jatuh tempo (BR-VPQ-06). */
  paymentDate: Date
  /** Tagihan tujuan; null tampil `—` (BR-VPQ-07). */
  vendorBillId: number | null
  vendorBillDocumentNo: string | null
  /** VendorPayment.createdBy = User.id; nama diselesaikan loader massal. */
  createdByName: string | null
  createdAt: Date
}

export interface VendorPaymentDraftRow extends VendorPaymentDraftInput {
  tingkat: VendorPaymentDraftLevel
  tingkatLabel: string
  /** Hari kalender WIB sejak createdAt; masa depan = 0 (EC-VPQ-4). */
  umurDraftHari: number
  /** createdAt sesudah hari laporan (jam server) — umur ditahan 0. */
  umurDariMasaDepan: boolean
  /** paymentDate lampau = fakta tanggal rencana; TIDAK mengubah tingkat. */
  paymentDateLampau: boolean
}

export interface VendorPaymentDraftVendorCount {
  vendorId: number
  vendorName: string
  levelCounts: Record<VendorPaymentDraftLevel, number>
  total: number
  /** Σ amount baris vendor ini — berlabel VENDOR_PAYMENT_DRAFT_TOTAL_LABEL. */
  totalAmount: number
}

export interface VendorPaymentDraftQueue {
  rows: VendorPaymentDraftRow[]
  /** Hitungan per tingkat atas baris tampil. */
  levelCounts: Record<VendorPaymentDraftLevel, number>
  /** Hitungan + Σ amount per vendor atas baris tampil yang sama. */
  vendorCounts: VendorPaymentDraftVendorCount[]
  totalDocuments: number
  /** Σ amount semua baris tampil — berlabel VENDOR_PAYMENT_DRAFT_TOTAL_LABEL. */
  totalAmount: number
  /** Label rekap nilai verbatim Q-VPQ-2, selalu terisi. */
  totalLabel: string
}

/** Tengah malam UTC hari kalender WIB dari sebuah instan. */
function wibCalendarDay(instant: Date): Date {
  const wib = new Date(instant.getTime() + WIB_OFFSET_HOURS * 3_600_000)
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()))
}

export function deriveVendorPaymentDraftAge(
  createdAt: Date,
  todayUtcMidnight: Date,
): { umurDraftHari: number; umurDariMasaDepan: boolean } {
  const createdDay = wibCalendarDay(createdAt)
  const diff = Math.round((todayUtcMidnight.getTime() - createdDay.getTime()) / MS_PER_DAY)
  return { umurDraftHari: Math.max(0, diff), umurDariMasaDepan: diff < 0 }
}

/** paymentDate lampau = hari kalender WIB hari ini sesudah hari paymentDate. */
export function deriveVendorPaymentDateLampau(
  paymentDate: Date,
  todayUtcMidnight: Date,
): boolean {
  return wibCalendarDay(paymentDate).getTime() < todayUtcMidnight.getTime()
}

export function buildVendorPaymentDraftQueue(
  inputs: VendorPaymentDraftInput[],
  now: Date = new Date(),
  staleDays: number = VENDOR_PAYMENT_DRAFT_STALE_DAYS,
): VendorPaymentDraftQueue {
  const today = getWibTodayUtcDate(now)
  const rows: VendorPaymentDraftRow[] = []

  for (const input of inputs) {
    if (input.status !== "draft") continue
    if (input.deletedAt !== null) continue
    const { umurDraftHari, umurDariMasaDepan } = deriveVendorPaymentDraftAge(
      input.createdAt,
      today,
    )
    const tingkat: VendorPaymentDraftLevel =
      umurDraftHari >= staleDays ? "mengendap" : "menunggu"
    rows.push({
      ...input,
      tingkat,
      tingkatLabel: VENDOR_PAYMENT_DRAFT_LEVEL_LABELS[tingkat],
      umurDraftHari,
      umurDariMasaDepan,
      paymentDateLampau: deriveVendorPaymentDateLampau(input.paymentDate, today),
    })
  }

  const LEVEL_ORDER: Record<VendorPaymentDraftLevel, number> = {
    mengendap: 0,
    menunggu: 1,
  }
  rows.sort((a, b) => {
    const levelDiff = LEVEL_ORDER[a.tingkat] - LEVEL_ORDER[b.tingkat]
    if (levelDiff !== 0) return levelDiff
    // Dalam tingkat: umur tertua dulu = createdAt menaik.
    const createdDiff = a.createdAt.getTime() - b.createdAt.getTime()
    if (createdDiff !== 0) return createdDiff
    const docDiff = a.documentNo.localeCompare(b.documentNo)
    if (docDiff !== 0) return docDiff
    return a.vendorPaymentId - b.vendorPaymentId
  })

  const levelCounts: Record<VendorPaymentDraftLevel, number> = {
    mengendap: 0,
    menunggu: 0,
  }
  const vendorMap = new Map<number, VendorPaymentDraftVendorCount>()
  // Σ eksak bersen (vonis Accountant PR #1109): jumlahkan sen integer,
  // bukan float64 polos — 0.1+0.2 wajib 0.3 eksak. Baris tetap verbatim.
  let totalAmountSen = 0
  const vendorSen = new Map<number, number>()
  for (const row of rows) {
    levelCounts[row.tingkat] += 1
    const rowSen = Math.round(row.amount * 100)
    totalAmountSen += rowSen
    vendorSen.set(row.vendorId, (vendorSen.get(row.vendorId) ?? 0) + rowSen)
    let entry = vendorMap.get(row.vendorId)
    if (!entry) {
      entry = {
        vendorId: row.vendorId,
        vendorName: row.vendorName,
        levelCounts: { mengendap: 0, menunggu: 0 },
        total: 0,
        totalAmount: 0,
      }
      vendorMap.set(row.vendorId, entry)
    }
    entry.levelCounts[row.tingkat] += 1
    entry.total += 1
    entry.totalAmount = (vendorSen.get(row.vendorId) ?? 0) / 100
  }

  return {
    rows,
    levelCounts,
    vendorCounts: [...vendorMap.values()].sort(
      (a, b) => a.vendorName.localeCompare(b.vendorName) || a.vendorId - b.vendorId,
    ),
    totalDocuments: rows.length,
    totalAmount: totalAmountSen / 100,
    totalLabel: VENDOR_PAYMENT_DRAFT_TOTAL_LABEL,
  }
}
