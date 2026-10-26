/**
 * F-2026-10-26-058-S — antrean SO terkirim belum terfaktur penuh (baca-saja).
 *
 * Turunan murni: per SO membandingkan nilai yang sudah terkirim (surat jalan
 * sah) dengan nilai yang sudah terfaktur (faktur penjualan tertaut sah).
 * SO tampil hanya bila masih ada sisa yang belum terfaktur; antrean adalah
 * daftar kerja penagihan, bukan status berkas baru — tidak ada tulis
 * status/jurnal/stok/piutang di sini (BR-DU-04).
 *
 * Definisi populasi (spec §3 + putusan Lead Q-DU-1/2/3, PR #968):
 * - SO: status `confirmed`/`processing`/`completed`
 *   (`FULFILLABLE_ORDER_STATUSES`, order-fulfillment-data.ts), `deletedAt`
 *   null. `draft`/`cancelled` di luar populasi.
 * - Terkirim: hanya DeliveryOrder `shipped`/`delivered`
 *   (`SHIPPED_DELIVERY_STATUSES`) per `DeliveryOrderItem.salesOrderItemId`.
 *   DO `draft` belum keluar gudang — tidak menghitung (AC-DU-5). Baris jasa
 *   tanpa DO sah tidak punya bukti terkirim dokumen, jadi tidak tampil
 *   (BR-DU-03, diputus Q-DU-3).
 * - Terfaktur: hanya SalesInvoice dengan `salesOrderId` = SO ini,
 *   `deletedAt IS NULL`, status persis `RECOGNISED_AR_STATUSES`
 *   (posted/partial/paid, document-status.ts) — diimpor, bukan ditulis ulang
 *   (putusan tambahan Lead 26 Okt 2026). `sent`/`approved` belum terbit
 *   (belum ada piutang/jurnal), jadi justru baris yang dikejar antrean dan
 *   TIDAK mengurangi; `draft`/`cancelled` juga tidak. Faktur manual tanpa
 *   `salesOrderId` tidak mengurangi SO mana pun (AC-DU-4). Dilarang memakai
 *   definisi non-cancelled ala `billedAmountExcludingCancelled` — itu
 *   menyembunyikan persis baris yang dicari antrean ini.
 *
 * Nilai (per SO): `nilaiTerkirim = Σ qty terkirim × unitPrice baris SO`;
 * `nilaiTerfaktur = Σ grandTotal faktur sah`; `sisa = terkirim − terfaktur`.
 * Tampil hanya bila `nilaiTerkirim > 0` DAN `sisa > COLLECTION_SETTLED_EPSILON`
 * (epsilon uang existing, aging-amounts.ts). Terfaktur >= terkirim -> tidak
 * tampil, tanpa sisa negatif (AC-DU-6; kelebihan tagih = domain rekonsiliasi).
 * Retur penjualan tidak mengurangi sisa (spec §3: antrean menilai tautan
 * faktur, bukan retur).
 *
 * Titik umur (Q-DU-1 diputus): DO sah TERAKHIR per SO — stempel sah DO itu:
 * `delivered` -> `deliveredAt`; `shipped` -> `confirmedAt`; fallback bila
 * stempel kosong (data warisan) -> `DeliveryOrder.date`. Ambil MAX per SO di
 * antara DO sah yang menaikkan nilai terkirim. Umur = hari kalender WIB sejak
 * stempel itu sampai tanggal laporan (`now` diinjeksikan pemanggil, builder
 * tidak membaca jam sistem). Kolom hari mentah TANPA ember/ambang (Q-DU-2 —
 * batas ember = angka karang, BR-DU-07). Urut default: umur tertua dulu
 * (stempel terakhir menaik), seri documentNo lalu id — deterministik.
 *
 * Payload verbatim siap tampil: UI dilarang hitung ulang angka di sini.
 * Pure (tanpa Prisma/DOM). Loader: `delivered-unbilled-data.ts`.
 */

import { COLLECTION_SETTLED_EPSILON } from "@/lib/reports/aging-amounts"
import { RECOGNISED_AR_STATUSES } from "@/lib/reports/document-status"
import { getWibTodayUtcDate, WIB_OFFSET_HOURS } from "@/lib/utils/attendance-time"
import { safeAdd, safeMultiply, safeSubtract } from "@/lib/utils/math"

const MS_PER_DAY = 86_400_000

/** Notice jujur — UI menempel apa adanya. */
export const DELIVERED_UNBILLED_NOTICE_TEXT =
  "Antrean pesanan penjualan yang barangnya sudah terkirim (surat jalan terkirim/diterima) tetapi belum terfaktur penuh menurut faktur tertaut yang sudah terbit (terposting). Daftar ini baca-saja; tindak lanjut lewat detail pesanan penjualan."

/** Teks kosong jujur — bukan angka 0 karang. */
export const DELIVERED_UNBILLED_EMPTY_TEXT =
  "Tidak ada pesanan penjualan terkirim yang belum terfaktur pada cakupan ini."

export interface DeliveredUnbilledLineInput {
  /** Id baris SO (SalesOrderItem.id) — kunci tautan DO. */
  lineId: number
  /** Qty terkirim dari DO shipped/delivered per tautan baris (agregasi loader). */
  deliveredQty: number
  /** Harga satuan baris SO (SalesOrderItem.unitPrice). */
  unitPrice: number
}

export interface DeliveredUnbilledDeliveryInput {
  /** Status DeliveryOrder apa adanya; builder hanya menerima shipped/delivered. */
  status: string
  /** DeliveryOrder.date (tanggal dokumen DO). */
  date: Date
  /** DeliveryOrder.confirmedAt — distempel saat ship; null pada data warisan. */
  confirmedAt: Date | null
  /** DeliveryOrder.deliveredAt — distempel saat delivered; null bila belum. */
  deliveredAt: Date | null
  /** Qty terkirim DO ini yang tertaut baris SO pesanan ini (>0 = menaikkan nilai). */
  deliveredQty: number
}

export interface DeliveredUnbilledInvoiceInput {
  /** SalesInvoice.salesOrderId; null = faktur manual tanpa tautan (tidak mengurangi). */
  salesOrderId: number | null
  /** Status SalesInvoice apa adanya. */
  status: string
  /** SalesInvoice.deletedAt; terisi = terhapus lunak (tidak mengurangi). */
  deletedAt: Date | null
  /** SalesInvoice.grandTotal. */
  grandTotal: number
}

export interface DeliveredUnbilledInput {
  salesOrderId: number
  slug: string | null
  documentNo: string
  /** Status SO apa adanya; builder menyaring populasi FULFILLABLE_ORDER_STATUSES. */
  status: string
  /** SalesOrder.deletedAt; terisi = di luar populasi. */
  deletedAt: Date | null
  /** Tanggal dokumen SO. */
  date: Date
  customerName: string
  lines: DeliveredUnbilledLineInput[]
  deliveries: DeliveredUnbilledDeliveryInput[]
  /** Faktur tertaut SO ini (loader sudah membatasi salesOrderId = SO ini). */
  invoices: DeliveredUnbilledInvoiceInput[]
}

export interface DeliveredUnbilledRow {
  salesOrderId: number
  slug: string | null
  documentNo: string
  customerName: string
  /** Tanggal dokumen SO. */
  date: Date
  /** Stempel sah DO sah terakhir per SO (Q-DU-1). */
  lastDeliveryAt: Date
  /** Hari kalender WIB sejak lastDeliveryAt sampai tanggal laporan; mentah, tanpa ember (Q-DU-2). */
  ageDays: number
  /** Σ qty terkirim × unitPrice baris SO. */
  deliveredValue: number
  /** Σ grandTotal faktur sah tertaut (RECOGNISED_AR_STATUSES, non-terhapus). */
  billedValue: number
  /** deliveredValue − billedValue; selalu > epsilon pada baris tampil. */
  unbilledValue: number
}

export interface DeliveredUnbilledQueue {
  rows: DeliveredUnbilledRow[]
  totalDocuments: number
  totalDeliveredValue: number
  totalBilledValue: number
  totalUnbilledValue: number
}

const RECOGNISED = new Set<string>(RECOGNISED_AR_STATUSES)
const SHIPPED_DELIVERED = new Set(["shipped", "delivered"])

/** Stempel sah satu DO (Q-DU-1): delivered -> deliveredAt, shipped -> confirmedAt, fallback date. */
export function deliveryStamp(delivery: DeliveredUnbilledDeliveryInput): Date {
  if (delivery.status === "delivered" && delivery.deliveredAt != null) return delivery.deliveredAt
  if (delivery.status === "shipped" && delivery.confirmedAt != null) return delivery.confirmedAt
  return delivery.date
}

/** Tengah malam UTC hari kalender WIB dari sebuah instan (untuk umur hari kalender). */
function wibCalendarDay(instant: Date): Date {
  const wib = new Date(instant.getTime() + WIB_OFFSET_HOURS * 3_600_000)
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()))
}

export function buildDeliveredUnbilledQueue(
  inputs: DeliveredUnbilledInput[],
  now: Date = new Date(),
  populationStatuses: readonly string[],
): DeliveredUnbilledQueue {
  const today = getWibTodayUtcDate(now)
  const population = new Set<string>(populationStatuses)
  const rows: DeliveredUnbilledRow[] = []

  for (const input of inputs) {
    if (!population.has(input.status)) continue
    if (input.deletedAt != null) continue

    let deliveredValue = 0
    for (const line of input.lines) {
      if (line.deliveredQty <= 0) continue
      deliveredValue = safeAdd(
        deliveredValue,
        safeMultiply(line.deliveredQty, line.unitPrice, 2),
        2,
      )
    }
    // Belum terkirim = domain Pemenuhan Pesanan, bukan antrean tagih (BR-DU-03).
    if (deliveredValue <= 0) continue

    // Stempel DO sah terakhir: hanya DO shipped/delivered yang menaikkan nilai.
    let lastDeliveryAt: Date | null = null
    for (const delivery of input.deliveries) {
      if (!SHIPPED_DELIVERED.has(delivery.status)) continue
      if (delivery.deliveredQty <= 0) continue
      const stamp = deliveryStamp(delivery)
      if (lastDeliveryAt === null || stamp.getTime() > lastDeliveryAt.getTime()) {
        lastDeliveryAt = stamp
      }
    }
    if (lastDeliveryAt === null) continue

    let billedValue = 0
    for (const invoice of input.invoices) {
      // Faktur tanpa tautan SO tidak mengurangi SO mana pun (AC-DU-4).
      if (invoice.salesOrderId !== input.salesOrderId) continue
      if (invoice.deletedAt != null) continue
      // Hanya faktur terbit (posted/partial/paid); draft/sent/approved/cancelled tidak.
      if (!RECOGNISED.has(invoice.status)) continue
      billedValue = safeAdd(billedValue, invoice.grandTotal, 2)
    }

    const unbilledValue = safeSubtract(deliveredValue, billedValue, 2)
    // Terfaktur penuh/berlebih tidak tampil; tanpa sisa negatif (AC-DU-6).
    if (unbilledValue <= COLLECTION_SETTLED_EPSILON) continue

    const ageDays = Math.max(
      0,
      Math.round((today.getTime() - wibCalendarDay(lastDeliveryAt).getTime()) / MS_PER_DAY),
    )

    rows.push({
      salesOrderId: input.salesOrderId,
      slug: input.slug,
      documentNo: input.documentNo,
      customerName: input.customerName,
      date: input.date,
      lastDeliveryAt,
      ageDays,
      deliveredValue,
      billedValue,
      unbilledValue,
    })
  }

  rows.sort((a, b) => {
    // Umur tertua dulu = stempel DO terakhir paling awal dulu (Q-DU-2).
    const stampDiff = a.lastDeliveryAt.getTime() - b.lastDeliveryAt.getTime()
    if (stampDiff !== 0) return stampDiff
    const docDiff = a.documentNo.localeCompare(b.documentNo)
    if (docDiff !== 0) return docDiff
    return a.salesOrderId - b.salesOrderId
  })

  let totalDeliveredValue = 0
  let totalBilledValue = 0
  let totalUnbilledValue = 0
  for (const row of rows) {
    totalDeliveredValue = safeAdd(totalDeliveredValue, row.deliveredValue, 2)
    totalBilledValue = safeAdd(totalBilledValue, row.billedValue, 2)
    totalUnbilledValue = safeAdd(totalUnbilledValue, row.unbilledValue, 2)
  }

  return {
    rows,
    totalDocuments: rows.length,
    totalDeliveredValue,
    totalBilledValue,
    totalUnbilledValue,
  }
}
