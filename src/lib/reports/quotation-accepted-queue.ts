/**
 * F-2026-10-25-002-S tahap 1 — antrean penawaran diterima belum dikonversi.
 *
 * Tahap TURUNAN dari (status quotation, keberadaan SalesOrder tertaut,
 * waktu terima, validUntil) vs hari kalender WIB — tanpa kolom tersimpan,
 * tanpa mutasi status/dokumen/jurnal (BR-AQ-06/11, AC-AQ-B6).
 *
 * PUTUSAN LEAD §12 backlog (PR #765): Q-AQ-1 BUKA reuse view_quotations
 * tanpa key baru/migrasi; Q-AQ-2 ambang MENGENDAP 3 hari kalender WIB;
 * Q-AQ-4 manual luar sistem (antrean hanya menandai MASA_BERLAKU_LEWAT);
 * Q-AQ-5 baris ber-WO/invoice tanpa SO TETAP di antrean tertanda fakta
 * pendamping; Q-AQ-6 nol notifikasi/cron tahap 1.
 *
 * Fisik Q-AQ-3 (diputus di sini, tertulis di PR): sumber waktu terima =
 * QuotationHistory action "accepted" TERAKHIR untuk revisionNumber
 * berjalan quotation (loader memasoknya; builder murni). Bukan updatedAt
 * (berubah oleh edit apa pun — AC-AQ-B4). Tidak ditemukan = umurTerimaHari
 * null tertanda "tidak tercatat" (EC-5), dilarang mengarang 0 hari.
 *
 * Semantik masa berlaku persis guard server `assertQuotationNotExpired`
 * (src/actions/sales.actions.ts): lewat bila hari WIB hari ini >
 * validUntil; hari validUntil sendiri masih berlaku. validUntil kosong =
 * TANPA_BATAS, sisaHari null (BR-AQ-05).
 *
 * Keanggotaan (BR-AQ-01/02): hanya baris TANPA SalesOrder tidak-cancelled
 * tertaut yang masuk baris antrean. SO hanya-cancelled = tertanda
 * pernah-dikonversi, TIDAK kembali menunggu biasa (AC-AQ-B3) — barisnya
 * tetap tampil dengan tahap khusus supaya manusia memutuskan.
 *
 * Pure (tanpa Prisma/DOM). Loader: `quotation-accepted-queue-data.ts`.
 * Urutan BR-AQ-06: MASA_BERLAKU_LEWAT dulu, MENGENDAP umur terbesar,
 * MENUNGGU umur terbesar; seri documentNo lalu id.
 */

import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

/** Ambang hari kalender WIB sejak terima untuk tahap MENGENDAP (Q-AQ-2). */
export const ACCEPTED_QUOTATION_STALE_DAYS = 3

export const ACCEPTED_QUOTATION_STAGES = [
  "MASA_BERLAKU_LEWAT",
  "MENGENDAP",
  "MENUNGGU_TINDAK_LANJUT",
  "PERNAH_DIKONVERSI_SO_BATAL",
] as const

export type AcceptedQuotationStage = (typeof ACCEPTED_QUOTATION_STAGES)[number]

/** Label tahap verbatim — UI menempel apa adanya (BR-AQ-09). */
export const ACCEPTED_QUOTATION_STAGE_LABELS: Record<AcceptedQuotationStage, string> = {
  MASA_BERLAKU_LEWAT: "Masa Berlaku Lewat",
  MENGENDAP: "Mengendap",
  MENUNGGU_TINDAK_LANJUT: "Menunggu Tindak Lanjut",
  PERNAH_DIKONVERSI_SO_BATAL: "Pernah Dikonversi — SO Dibatalkan",
}

/** Label jujur umur terima tidak tercatat (EC-5) — UI menempel apa adanya. */
export const ACCEPTED_QUOTATION_AGE_UNRECORDED_LABEL = "tidak tercatat"

/** Notice jujur — UI menempel apa adanya. */
export const ACCEPTED_QUOTATION_QUEUE_NOTICE_TEXT =
  "Antrean penawaran yang sudah diterima pelanggan tetapi belum menjadi pesanan penjualan. Uang muka, order kerja, atau faktur yang tertaut langsung bukan bukti konversi ke pesanan penjualan."

const MS_PER_DAY = 86_400_000

export interface AcceptedQuotationInput {
  quotationId: number
  slug: string | null
  documentNo: string
  /** Status sumber quotation: "accepted" | "approved" (loader menegakkan). */
  status: string
  customerId: number
  customerName: string
  /** Kontak pelanggan — hanya untuk antrean berizin; ekspor tanpa ini (BR-AQ-12). */
  phone: string | null
  contactPerson: string | null
  /** Penjual tercatat dari salesEmployeeId; null = tampil `—` (BR-AQ-12). */
  salesEmployeeId: number | null
  salesEmployeeName: string | null
  /** Kendaraan tertaut; null = tampil `—` (EC-6). */
  customerVehicleLabel: string | null
  date: Date
  validUntil: Date | null
  grandTotal: number
  /**
   * Waktu peristiwa terima: QuotationHistory action "accepted" terakhir
   * untuk revisionNumber berjalan. null = tidak tercatat (EC-5).
   */
  acceptedAt: Date | null
  /** Semua SalesOrder tertaut (status apa adanya dari server). */
  salesOrders: { id: number; documentNo: string; status: string }[]
  /** WorkOrder tertaut langsung ke quotation (fakta pendamping, BR-AQ-03). */
  workOrders: { id: number; documentNo: string; status: string }[]
  /** SalesInvoice tertaut langsung ke quotation (fakta pendamping, BR-AQ-03). */
  salesInvoices: { id: number; documentNo: string; status: string }[]
  /** DP tertaut; hanya status pending/confirmed yang dilaporkan (BR-AQ-07). */
  downPayments: { id: number; documentNo: string; status: string; amount: number }[]
}

export interface AcceptedQuotationRow extends AcceptedQuotationInput {
  tahap: AcceptedQuotationStage
  tahapLabel: string
  /** Hari kalender WIB sejak peristiwa terima; null bila tidak tercatat (EC-5). */
  umurTerimaHari: number | null
  /** Label umur verbatim server: angka hari atau "tidak tercatat". */
  umurTerimaLabel: string
  /** Hari kalender WIB sampai validUntil; negatif = lewat. null bila TANPA_BATAS. */
  sisaHari: number | null
  masaBerlakuLewat: boolean
  tanpaBatas: boolean
  /** Ada SO tidak-cancelled tertaut (baris seperti ini dikeluarkan builder). */
  punyaSoAktif: boolean
  /** Hanya SO cancelled yang tertaut (BR-AQ-02). */
  pernahDikonversiSoBatal: boolean
  /** Fakta pendamping: ada WO tertaut langsung (BUKAN konversi, BR-AQ-03). */
  punyaWorkOrderTertaut: boolean
  /** Fakta pendamping: ada invoice tertaut langsung (BUKAN konversi, BR-AQ-03). */
  punyaSalesInvoiceTertaut: boolean
  /** Fakta pendamping DP pending (tidak mengubah tahap, BR-AQ-07). */
  dpPendingCount: number
  dpPendingTotal: number
  /** Fakta pendamping DP confirmed (tidak mengubah tahap, BR-AQ-07). */
  dpConfirmedCount: number
  dpConfirmedTotal: number
}

function calendarDayDiff(fromUtcMidnight: Date, to: Date): number {
  return Math.round((to.getTime() - fromUtcMidnight.getTime()) / MS_PER_DAY)
}

function isCancelledStatus(status: string): boolean {
  return status.toLowerCase() === "cancelled"
}

const STAGE_ORDER: Record<AcceptedQuotationStage, number> = {
  MASA_BERLAKU_LEWAT: 0,
  MENGENDAP: 1,
  MENUNGGU_TINDAK_LANJUT: 2,
  PERNAH_DIKONVERSI_SO_BATAL: 3,
}

export function buildAcceptedQuotationQueue(
  inputs: AcceptedQuotationInput[],
  now: Date = new Date(),
  staleDays: number = ACCEPTED_QUOTATION_STALE_DAYS,
): AcceptedQuotationRow[] {
  const today = getWibTodayUtcDate(now)
  const rows: AcceptedQuotationRow[] = []

  for (const input of inputs) {
    const punyaSoAktif = input.salesOrders.some((so) => !isCancelledStatus(so.status))
    // BR-AQ-01/AC-AQ-B1: SO aktif tertaut = sudah dikonversi, keluar antrean.
    if (punyaSoAktif) continue
    const pernahDikonversiSoBatal = input.salesOrders.length > 0

    const tanpaBatas = !input.validUntil
    const sisaHari = input.validUntil ? calendarDayDiff(today, input.validUntil) : null
    const masaBerlakuLewat = sisaHari != null && sisaHari < 0

    const umurTerimaHari =
      input.acceptedAt != null
        ? Math.max(0, calendarDayDiff(today, input.acceptedAt) * -1)
        : null

    let tahap: AcceptedQuotationStage
    if (pernahDikonversiSoBatal) {
      tahap = "PERNAH_DIKONVERSI_SO_BATAL"
    } else if (masaBerlakuLewat) {
      tahap = "MASA_BERLAKU_LEWAT"
    } else if (umurTerimaHari != null && umurTerimaHari > staleDays) {
      tahap = "MENGENDAP"
    } else {
      tahap = "MENUNGGU_TINDAK_LANJUT"
    }

    const dpPending = input.downPayments.filter((dp) => dp.status === "pending")
    const dpConfirmed = input.downPayments.filter((dp) => dp.status === "confirmed")

    rows.push({
      ...input,
      tahap,
      tahapLabel: ACCEPTED_QUOTATION_STAGE_LABELS[tahap],
      umurTerimaHari,
      umurTerimaLabel:
        umurTerimaHari != null ? String(umurTerimaHari) : ACCEPTED_QUOTATION_AGE_UNRECORDED_LABEL,
      sisaHari,
      masaBerlakuLewat,
      tanpaBatas,
      punyaSoAktif,
      pernahDikonversiSoBatal,
      punyaWorkOrderTertaut: input.workOrders.length > 0,
      punyaSalesInvoiceTertaut: input.salesInvoices.length > 0,
      dpPendingCount: dpPending.length,
      dpPendingTotal: dpPending.reduce((sum, dp) => sum + dp.amount, 0),
      dpConfirmedCount: dpConfirmed.length,
      dpConfirmedTotal: dpConfirmed.reduce((sum, dp) => sum + dp.amount, 0),
    })
  }

  return rows.sort((a, b) => {
    const stageDiff = STAGE_ORDER[a.tahap] - STAGE_ORDER[b.tahap]
    if (stageDiff !== 0) return stageDiff
    // Dalam tahap sama: umur terbesar dulu; umur tak tercatat paling akhir.
    const ageA = a.umurTerimaHari ?? -1
    const ageB = b.umurTerimaHari ?? -1
    if (ageA !== ageB) return ageB - ageA
    const docDiff = a.documentNo.localeCompare(b.documentNo)
    if (docDiff !== 0) return docDiff
    return a.quotationId - b.quotationId
  })
}
