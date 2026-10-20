/**
 * Laporan umur WIP (F-2026-10-20-72, sub-bagian aman tanpa model baru).
 *
 * Order produksi yang masih berjalan menahan biaya di akun WIP sebesar
 * `totalActualCost − releasedCost` (sisa yang belum dirilis ke persediaan
 * barang jadi — rumus yang sama dengan penyelesaian parsial di
 * manufacturing.actions). Laporan ini membuat order menggantung terlihat:
 * umur hari sejak tanggal mulai, sisa WIP per order, dan ember umur
 * 0-30 / 31-60 / 61-90 / >90 hari.
 *
 * Batasan jujur:
 * - Hanya status berjalan yang dihitung (`in_progress`/`pending`/`draft` di
 *   builder disaring lagi agar loader yang berubah tidak membocorkan order
 *   selesai ke laporan). Order completed/cancelled bukan WIP berjalan.
 * - Total laporan adalah Σ sisa WIP order berjalan. Rekonsiliasi ke saldo
 *   GL akun WIP (`wipAccountId`) BUKAN bagian builder murni ini: saldo GL
 *   juga memuat jurnal WIP dari jalur lain, jadi selisihnya ditampilkan
 *   loader/UI sebagai angka pembanding, bukan dipaksa sama.
 * - Tanggal acuan umur = startDate bila ada, jatuh ke createdAt (selalu
 *   ada). Umur negatif (tanggal mulai di masa depan) dijepit ke 0.
 *
 * Pure (tanpa Prisma/DOM); loader massalnya ada di `wip-aging-data.ts`.
 */

import { safeRound, safeSubtract } from "@/lib/utils/math"

export const WIP_AGING_RUNNING_STATUSES = ["draft", "pending", "in_progress"] as const

export type WipAgingBucketId = "d0_30" | "d31_60" | "d61_90" | "over90"

export const WIP_AGING_BUCKETS: { id: WipAgingBucketId; label: string; maxDays: number | null }[] = [
  { id: "d0_30", label: "0-30 hari", maxDays: 30 },
  { id: "d31_60", label: "31-60 hari", maxDays: 60 },
  { id: "d61_90", label: "61-90 hari", maxDays: 90 },
  { id: "over90", label: ">90 hari", maxDays: null },
]

export interface WipAgingOrderInput {
  id: number
  slug: string | null
  documentNo: string
  status: string
  startDate: Date | null
  createdAt: Date
  qty: number
  completedQty: number
  totalActualCost: number
  releasedCost: number
  productName: string
  workOrderDocumentNo: string | null
}

export interface WipAgingOrder {
  id: number
  slug: string | null
  documentNo: string
  status: string
  productName: string
  workOrderDocumentNo: string | null
  /** Tanggal acuan umur (startDate ?? createdAt). */
  ageStart: Date
  ageDays: number
  bucket: WipAgingBucketId
  qty: number
  completedQty: number
  /** completedQty/qty persen 0..100; qty<=0 -> 0. */
  completionPercent: number
  totalActualCost: number
  releasedCost: number
  /** totalActualCost − releasedCost, dijepit >= 0. */
  wipAmount: number
}

export interface WipAgingBucket {
  id: WipAgingBucketId
  label: string
  orderCount: number
  wipAmount: number
}

export interface WipAging {
  orders: WipAgingOrder[]
  buckets: WipAgingBucket[]
  totalOrders: number
  totalWipAmount: number
  /** Order dengan sisa WIP terbesar; null bila kosong. */
  largestOrderId: number | null
}

const DAY_MS = 86_400_000

export function wipAgeDays(ageStart: Date, asOf: Date): number {
  const days = Math.floor((asOf.getTime() - ageStart.getTime()) / DAY_MS)
  return Math.max(0, days)
}

export function wipBucketForDays(ageDays: number): WipAgingBucketId {
  if (ageDays <= 30) return "d0_30"
  if (ageDays <= 60) return "d31_60"
  if (ageDays <= 90) return "d61_90"
  return "over90"
}

export function buildWipAging(input: {
  orders: readonly WipAgingOrderInput[]
  asOf: Date
}): WipAging {
  const orders: WipAgingOrder[] = []
  for (const order of input.orders) {
    if (!(WIP_AGING_RUNNING_STATUSES as readonly string[]).includes(order.status)) continue
    const ageStart = order.startDate ?? order.createdAt
    const ageDays = wipAgeDays(ageStart, input.asOf)
    const wipAmount = Math.max(0, safeSubtract(order.totalActualCost, order.releasedCost, 2))
    const completionPercent =
      order.qty > 0 ? safeRound(Math.min(100, Math.max(0, (order.completedQty / order.qty) * 100)), 2) : 0
    orders.push({
      id: order.id,
      slug: order.slug,
      documentNo: order.documentNo,
      status: order.status,
      productName: order.productName,
      workOrderDocumentNo: order.workOrderDocumentNo,
      ageStart,
      ageDays,
      bucket: wipBucketForDays(ageDays),
      qty: order.qty,
      completedQty: order.completedQty,
      completionPercent,
      totalActualCost: safeRound(order.totalActualCost, 2),
      releasedCost: safeRound(order.releasedCost, 2),
      wipAmount,
    })
  }
  // Deterministik: WIP terbesar dulu, lalu umur tertua, lalu nomor dokumen.
  orders.sort((a, b) => {
    if (b.wipAmount !== a.wipAmount) return b.wipAmount - a.wipAmount
    if (b.ageDays !== a.ageDays) return b.ageDays - a.ageDays
    if (a.documentNo !== b.documentNo) return a.documentNo < b.documentNo ? -1 : 1
    return a.id - b.id
  })

  const buckets: WipAgingBucket[] = WIP_AGING_BUCKETS.map((bucket) => {
    const inBucket = orders.filter((order) => order.bucket === bucket.id)
    return {
      id: bucket.id,
      label: bucket.label,
      orderCount: inBucket.length,
      wipAmount: safeRound(
        inBucket.reduce((sum, order) => sum + order.wipAmount, 0),
        2,
      ),
    }
  })

  return {
    orders,
    buckets,
    totalOrders: orders.length,
    totalWipAmount: safeRound(
      orders.reduce((sum, order) => sum + order.wipAmount, 0),
      2,
    ),
    largestOrderId: orders.length > 0 ? orders[0].id : null,
  }
}
