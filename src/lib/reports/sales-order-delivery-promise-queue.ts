/**
 * F-2026-10-25-029-S tahap 1 — antrean janji kirim pesanan penjualan.
 *
 * Baca-saja total (BR-SD-09): builder murni ini tidak menulis status,
 * tidak membuat surat jalan, tidak mengubah janji. Tindak lanjut lewat
 * halaman SO/surat jalan existing.
 *
 * Putusan Q-SD-* belum tertulis Lead saat fisik ini dibangun (verifikasi
 * live 26 Okt 2026: grep backlog+board+PR #859 = 0); diambil rekomendasi
 * spec usulan, semua bisa diubah tanpa migrasi:
 * - Q-SD-2 ambang due_soon = 3 hari kalender WIB, konstan bernama +
 *   argumen builder (bukan kolom schema).
 * - Q-SD-3 populasi = approved/confirmed/processing: gabungan
 *   DELIVERABLE_ORDER_STATUSES (approved/confirmed/processing/completed,
 *   sales.schemas.ts) dan FULFILLABLE_ORDER_STATUSES
 *   (confirmed/processing/completed, order-fulfillment-data.ts) minus
 *   completed. Completed bersisa = wilayah laporan Pemenuhan Pesanan
 *   existing (BR-SD-05). Konstanta di bawah BUKAN isi salah satu
 *   konstanta itu — ditulis eksplisit supaya bedanya terbaca.
 * - Q-SD-4 SO tanpa deliveryDate di luar populasi; loader menghitungnya
 *   terpisah sebagai penanda kualitas data (BR-SD-06), bukan baris.
 *
 * Terkirim memakai definisi existing yang sama dengan laporan
 * Pemenuhan Pesanan: Σ DeliveryOrderItem.qty dari DeliveryOrder status
 * shipped/delivered saja (order-fulfillment-data.ts, BR-SD-02); loader
 * mengagregasinya, builder hanya menerima deliveredQty per baris.
 * Sisa = ordered − delivered dengan toleransi mesin existing
 * (outstanding-lines.ts EPSILON 0.0001); baris over-delivered memberi
 * sisa 0, tidak menutup sisa baris lain (AC-SD-09).
 *
 * Waktu diinjeksikan pemanggil sebagai argumen `now` (pola
 * buildAcceptedQuotationQueue); builder tidak membaca jam sistem.
 * deliveryDate tersimpan tengah malam UTC hari kalender WIB
 * (createSalesOrder/updateSalesOrder: wibDateToUtcMidnight), jadi
 * selisih hari dihitung kalender WIB — deliveryDate tengah malam WIB
 * hari ini = due_today, bukan overdue (AC-SD-02).
 *
 * Pure (tanpa Prisma/DOM). Loader: `sales-order-delivery-promise-queue-data.ts`.
 */

import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"
import { safeAdd, safeMultiply } from "@/lib/utils/math"

/** Ambang hari kalender WIB untuk ember DUE_SOON (Q-SD-2, usulan spec). */
export const SO_DELIVERY_PROMISE_DUE_SOON_DAYS = 3

/**
 * Populasi status SO antrean — gabungan DELIVERABLE/FULFILLABLE minus
 * completed (lihat header). Ditulis eksplisit, BUKAN impor konstanta
 * lain, supaya tidak ada yang mengira isinya sama dengan konstanta itu.
 */
export const SO_DELIVERY_PROMISE_POPULATION_STATUSES = [
  "approved",
  "confirmed",
  "processing",
] as const

export const SO_DELIVERY_PROMISE_BUCKETS = ["overdue", "due_today", "due_soon"] as const

export type SoDeliveryPromiseBucket = (typeof SO_DELIVERY_PROMISE_BUCKETS)[number]

export const SO_DELIVERY_PROMISE_BUCKET_LABELS: Record<SoDeliveryPromiseBucket, string> = {
  overdue: "Lewat Janji",
  due_today: "Janji Hari Ini",
  due_soon: "Mendekati Janji",
}

/** Notice jujur — UI menempel apa adanya. */
export const SO_DELIVERY_PROMISE_QUEUE_NOTICE_TEXT =
  "Antrean pesanan penjualan yang janji kirimnya mendekati atau sudah lewat dan belum terkirim penuh. Daftar ini baca-saja; tindak lanjut lewat detail pesanan dan surat jalan."

const MS_PER_DAY = 86_400_000
/** Toleransi pembulatan kuantitas — sama dengan mesin outstanding-lines. */
const EPSILON = 0.0001

export interface SalesOrderDeliveryPromiseLineInput {
  /** Kuantitas dipesan (SalesOrderItem.qty). */
  orderedQty: number
  /** Sudah terkirim: agregasi loader dari DeliveryOrder shipped/delivered. */
  deliveredQty: number
  /** Harga satuan baris (SalesOrderItem.unitPrice) untuk nilai sisa. */
  unitPrice: number
}

export interface SalesOrderDeliveryPromiseInput {
  salesOrderId: number
  slug: string | null
  documentNo: string
  /** Status SO apa adanya; builder menyaring populasi (BR-SD-01/05). */
  status: string
  /** Tanggal dokumen SO. */
  date: Date
  /** Janji kirim; null = tanpa janji (di luar populasi, BR-SD-06). */
  deliveryDate: Date | null
  customerName: string
  /** Penjual tercatat; null = tampil `—`, tetap masuk populasi (BR-SD-10). */
  salesEmployeeName: string | null
  lines: SalesOrderDeliveryPromiseLineInput[]
}

export interface SalesOrderDeliveryPromiseRow extends SalesOrderDeliveryPromiseInput {
  /** Janji kirim non-null pada baris antrean (populasi menegakkannya). */
  deliveryDate: Date
  bucket: SoDeliveryPromiseBucket
  bucketLabel: string
  /** Hari kalender WIB sampai janji; negatif = lewat. */
  daysUntilDue: number
  /** Jumlah baris bersisa terkirim. */
  linesRemaining: number
  /** Σ max(sisa, 0) × unitPrice per baris (BR-SD-07). */
  outstandingValue: number
}

export interface SoDeliveryPromiseBucketTotal {
  bucket: SoDeliveryPromiseBucket
  bucketLabel: string
  documents: number
  outstandingValue: number
}

export interface SalesOrderDeliveryPromiseQueue {
  rows: SalesOrderDeliveryPromiseRow[]
  totals: SoDeliveryPromiseBucketTotal[]
  totalDocuments: number
  totalOutstandingValue: number
}

const BUCKET_ORDER: Record<SoDeliveryPromiseBucket, number> = {
  overdue: 0,
  due_today: 1,
  due_soon: 2,
}

function calendarDayDiff(fromUtcMidnight: Date, to: Date): number {
  return Math.round((to.getTime() - fromUtcMidnight.getTime()) / MS_PER_DAY)
}

function bucketFor(daysUntilDue: number): SoDeliveryPromiseBucket {
  if (daysUntilDue < 0) return "overdue"
  if (daysUntilDue === 0) return "due_today"
  return "due_soon"
}

export function buildSalesOrderDeliveryPromiseQueue(
  inputs: SalesOrderDeliveryPromiseInput[],
  now: Date = new Date(),
  dueSoonDays: number = SO_DELIVERY_PROMISE_DUE_SOON_DAYS,
): SalesOrderDeliveryPromiseQueue {
  const today = getWibTodayUtcDate(now)
  const population = new Set<string>(SO_DELIVERY_PROMISE_POPULATION_STATUSES)
  const rows: SalesOrderDeliveryPromiseRow[] = []

  for (const input of inputs) {
    // BR-SD-05: draft/cancelled/completed bukan populasi (kontrol negatif).
    if (!population.has(input.status)) continue
    // BR-SD-06: tanpa janji bukan baris; dihitung loader sebagai penanda.
    if (input.deliveryDate == null) continue

    const daysUntilDue = calendarDayDiff(today, input.deliveryDate)
    // Di luar jendela due_soon bukan populasi antrean.
    if (daysUntilDue > dueSoonDays) continue

    let linesRemaining = 0
    let outstandingValue = 0
    for (const line of input.lines) {
      const remaining = line.orderedQty - line.deliveredQty
      if (remaining <= EPSILON) continue
      linesRemaining += 1
      outstandingValue = safeAdd(
        outstandingValue,
        safeMultiply(remaining, line.unitPrice, 2),
        2,
      )
    }
    // BR-SD-04: terkirim penuh keluar antrean walau janji sudah lewat.
    if (linesRemaining === 0) continue

    const bucket = bucketFor(daysUntilDue)
    rows.push({
      ...input,
      deliveryDate: input.deliveryDate,
      bucket,
      bucketLabel: SO_DELIVERY_PROMISE_BUCKET_LABELS[bucket],
      daysUntilDue,
      linesRemaining,
      outstandingValue,
    })
  }

  rows.sort((a, b) => {
    const bucketDiff = BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket]
    if (bucketDiff !== 0) return bucketDiff
    // Overdue paling lama dulu; due_soon terdekat dulu — keduanya
    // deliveryDate menaik. Seri: documentNo, lalu id (deterministik).
    const dateDiff = a.deliveryDate.getTime() - b.deliveryDate.getTime()
    if (dateDiff !== 0) return dateDiff
    const docDiff = a.documentNo.localeCompare(b.documentNo)
    if (docDiff !== 0) return docDiff
    return a.salesOrderId - b.salesOrderId
  })

  const totals: SoDeliveryPromiseBucketTotal[] = SO_DELIVERY_PROMISE_BUCKETS.map(
    (bucket) => ({ bucket, bucketLabel: SO_DELIVERY_PROMISE_BUCKET_LABELS[bucket], documents: 0, outstandingValue: 0 }),
  )
  const totalByBucket = new Map(totals.map((t) => [t.bucket, t]))
  let totalOutstandingValue = 0
  for (const row of rows) {
    const total = totalByBucket.get(row.bucket)
    if (total) {
      total.documents += 1
      total.outstandingValue = safeAdd(total.outstandingValue, row.outstandingValue, 2)
    }
    totalOutstandingValue = safeAdd(totalOutstandingValue, row.outstandingValue, 2)
  }

  return { rows, totals, totalDocuments: rows.length, totalOutstandingValue }
}
