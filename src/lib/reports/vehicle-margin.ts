/**
 * Margin job per kendaraan — guliran read-model (F-2026-10-21-033).
 *
 * Prasyarat backlog terpenuhi: builder tunggal F-029 `buildProjectPl`
 * (PR #293) + halaman L/R Proyek (PR #299) sudah merged. Builder ini
 * TIDAK menentukan aturan uang baru — ia mengelompokkan ulang output
 * builder existing per `customerVehicleId`:
 *
 *  (a) Proyek ber-kendaraan: seluruh `ProjectPlResult` proyek itu
 *      (pendapatan subtotal−diskon invoice posted/partial/paid dedup
 *      dua jembatan, material, ProductionCost, expense, petty, vendor
 *      bill sesudah saringan anti-dobel) masuk ke kendaraan proyek.
 *  (b) WO non-proyek ber-kendaraan: pendapatan DPP + ProductionCost.
 *      Pendapatan per vonis Q-033-1 (BOT 4) = Σ (subtotal−diskon)
 *      invoice posted/partial/paid belum terhapus yang terjangkau
 *      jembatan quotation/SO WO itu (dedup per id, atribusi invoice
 *      bersama ke WO pertama urut tanggal ditangani loader) — subtotal−diskon,
 *      sama dengan kelas (a)/(c), BUKAN grandTotal yang memuat PPN.
 *      biaya = Σ ProductionCost.amount terikat WO atau lewat
 *      ProductionOrder-nya. MI manual completed yang tertaut langsung
 *      ke WO (tanpa jalur ProductionOrder) TIDAK dijumlahkan (Q-033-2:
 *      menghindari biaya material dobel); baris kendaraannya hanya
 *      ditandai `hasUnlinkedMaterial`.
 *  (c) Invoice langsung ber-kendaraan tanpa WO/proyek tertaut:
 *      pendapatan saja (subtotal−diskon, definisi project-pl), biaya 0,
 *      dihitung sebagai baris `directInvoiceCount` supaya margin
 *      kendaraan yang dominan tipe ini tertanda parsial.
 *
 * Kunci guliran = `customerVehicleId`, BUKAN plat teks (plat bisa sama
 * antar pelanggan / berubah). Plat hanya label tampil. Proyek/WO/invoice
 * tanpa kendaraan masuk ember eksplisit `Tanpa kendaraan`
 * (customerVehicleId null), tidak dibuang diam-diam — total semua ember
 * wajib rekonsiliasi ke total sumber.
 *
 * Label wajib: "margin job kendaraan" — BUKAN laba akuntansi. Tanpa
 * alokasi overhead, tanpa jurnal, tanpa dimensi GL. marginPercent
 * kendaraan = profit/revenue AGREGAT (dihitung dari total), dilarang
 * merata-ratakan marginPercent per proyek.
 *
 * Pure (tanpa Prisma/DOM). Loader DB ada di `vehicle-margin-data.ts`.
 * Sen-aman lewat helper `src/lib/utils/math`.
 */

import { safeRound, safeSubtract, safeSum } from "@/lib/utils/math"
import type { ProjectPlResult } from "@/lib/reports/project-pl"

/** Label kontrak — frontend wajib menempel apa adanya. */
export const VEHICLE_MARGIN_LABEL = "margin job kendaraan"

export interface VehicleMarginProjectInput {
  /** customerVehicleId proyek; null = proyek tanpa kendaraan. */
  customerVehicleId: number | null
  /** Label plat proyek (label tampil saja, bukan kunci). */
  vehiclePlate: string | null
  customerName: string
  /** Output buildProjectPl proyek ini, apa adanya. */
  pl: ProjectPlResult
}

export interface VehicleMarginJobInput {
  workOrderId: number
  customerVehicleId: number | null
  vehiclePlate: string | null
  customerName: string
  /**
   * Pendapatan DPP (subtotal−discount, BUKAN grandTotal) invoice terhitung
   * ditagih — status dari job-billing-summary, basis DPP dari vonis
   * Q-033-1 (BOT 4) agar sebanding dengan kelas (a)/(c).
   */
  billedAmount: number
  /** Σ ProductionCost.amount WO ini (langsung / via ProductionOrder). */
  actualCost: number
  /**
   * True bila ada MaterialIssue completed tertaut langsung ke WO ini
   * (tanpa jalur ProductionOrder, Q-033-2): biaya material itu TIDAK masuk
   * actualCost — penanda parsial saja, Tanpa jumlah.
   */
  hasUnlinkedMaterial: boolean
}

export interface VehicleMarginDirectInvoiceInput {
  id: number
  customerVehicleId: number | null
  vehiclePlate: string | null
  customerName: string
  /** subtotal − discount invoice ini (definisi pendapatan project-pl). */
  revenue: number
}

export interface VehicleMarginInput {
  projects: VehicleMarginProjectInput[]
  jobs: VehicleMarginJobInput[]
  directInvoices: VehicleMarginDirectInvoiceInput[]
}

export interface VehicleMarginRow {
  /** Kunci guliran; null = ember eksplisit Tanpa kendaraan. */
  customerVehicleId: number | null
  /** Label plat pertama yang terlihat untuk kendaraan ini; null bila tak ada. */
  vehiclePlate: string | null
  customerName: string
  revenue: number
  totalCost: number
  /** Rincian biaya warisan builder asal (proyek + WO non-proyek). */
  materialCost: number
  productionCost: number
  otherCost: number
  profit: number
  /** profit / revenue × 100 dari AGREGAT; 0 bila revenue 0. */
  marginPercent: number
  projectCount: number
  jobCount: number
  /** Baris pendapatan tanpa job tertaut (tipe c). */
  directInvoiceCount: number
  /** Punya baris tipe (c): margin belum memuat biaya job untuk itu. */
  hasUnlinkedRevenue: boolean
  /** Punya MI completed langsung ke WO non-proyek (Q-033-2): biaya material langsung belum termasuk di totalCost. */
  hasUnlinkedMaterial: boolean
}

export interface VehicleMarginResult {
  label: typeof VEHICLE_MARGIN_LABEL
  rows: VehicleMarginRow[]
  totals: {
    revenue: number
    totalCost: number
    profit: number
    marginPercent: number
    projectCount: number
    jobCount: number
    directInvoiceCount: number
  }
}

interface Bucket {
  customerVehicleId: number | null
  vehiclePlate: string | null
  customerName: string
  revenues: number[]
  materialCosts: number[]
  productionCosts: number[]
  otherCosts: number[]
  projectCount: number
  jobCount: number
  directInvoiceCount: number
  hasUnlinkedMaterial: boolean
}

export function buildVehicleMargin(input: VehicleMarginInput): VehicleMarginResult {
  const buckets = new Map<number | null, Bucket>()
  const bucketOf = (
    customerVehicleId: number | null,
    vehiclePlate: string | null,
    customerName: string,
  ): Bucket => {
    let bucket = buckets.get(customerVehicleId)
    if (!bucket) {
      bucket = {
        customerVehicleId,
        vehiclePlate,
        customerName,
        revenues: [],
        materialCosts: [],
        productionCosts: [],
        otherCosts: [],
        projectCount: 0,
        jobCount: 0,
        directInvoiceCount: 0,
        hasUnlinkedMaterial: false,
      }
      buckets.set(customerVehicleId, bucket)
    }
    if (bucket.vehiclePlate === null && vehiclePlate !== null) {
      bucket.vehiclePlate = vehiclePlate
    }
    return bucket
  }

  // (a) Proyek: warisi seluruh hasil builder F-029 apa adanya.
  for (const project of input.projects) {
    const bucket = bucketOf(project.customerVehicleId, project.vehiclePlate, project.customerName)
    bucket.revenues.push(project.pl.revenue)
    bucket.materialCosts.push(project.pl.materialCost)
    bucket.productionCosts.push(project.pl.productionCost)
    bucket.otherCosts.push(
      safeSum([project.pl.expenseCost, project.pl.pettyCashCost, project.pl.vendorBillCost], 2),
    )
    bucket.projectCount += 1
  }

  // (b) WO non-proyek: pendapatan DPP + ProductionCost.
  for (const job of input.jobs) {
    const bucket = bucketOf(job.customerVehicleId, job.vehiclePlate, job.customerName)
    bucket.revenues.push(job.billedAmount)
    bucket.productionCosts.push(job.actualCost)
    bucket.jobCount += 1
    if (job.hasUnlinkedMaterial) bucket.hasUnlinkedMaterial = true
  }

  // (c) Invoice langsung tanpa job: pendapatan saja, tertanda.
  for (const invoice of input.directInvoices) {
    const bucket = bucketOf(invoice.customerVehicleId, invoice.vehiclePlate, invoice.customerName)
    bucket.revenues.push(invoice.revenue)
    bucket.directInvoiceCount += 1
  }

  const finish = (bucket: Bucket): VehicleMarginRow => {
    const revenue = safeSum(bucket.revenues, 2)
    const materialCost = safeSum(bucket.materialCosts, 2)
    const productionCost = safeSum(bucket.productionCosts, 2)
    const otherCost = safeSum(bucket.otherCosts, 2)
    const totalCost = safeSum([materialCost, productionCost, otherCost], 2)
    const profit = safeSubtract(revenue, totalCost, 2)
    return {
      customerVehicleId: bucket.customerVehicleId,
      vehiclePlate: bucket.vehiclePlate,
      customerName: bucket.customerName,
      revenue,
      totalCost,
      materialCost,
      productionCost,
      otherCost,
      profit,
      // Dari agregat — BUKAN rata-rata marginPercent per proyek.
      marginPercent: revenue > 0 ? safeRound((profit / revenue) * 100, 2) : 0,
      projectCount: bucket.projectCount,
      jobCount: bucket.jobCount,
      directInvoiceCount: bucket.directInvoiceCount,
      hasUnlinkedRevenue: bucket.directInvoiceCount > 0,
      hasUnlinkedMaterial: bucket.hasUnlinkedMaterial,
    }
  }

  const rows = [...buckets.values()]
    .map(finish)
    .sort((a, b) => {
      // Ember Tanpa kendaraan selalu terakhir; sisanya profit terbesar dulu.
      if (a.customerVehicleId === null) return 1
      if (b.customerVehicleId === null) return -1
      return b.profit - a.profit || (a.customerVehicleId ?? 0) - (b.customerVehicleId ?? 0)
    })

  const revenue = safeSum(rows.map((r) => r.revenue), 2)
  const totalCost = safeSum(rows.map((r) => r.totalCost), 2)
  const profit = safeSubtract(revenue, totalCost, 2)
  return {
    label: VEHICLE_MARGIN_LABEL,
    rows,
    totals: {
      revenue,
      totalCost,
      profit,
      marginPercent: revenue > 0 ? safeRound((profit / revenue) * 100, 2) : 0,
      projectCount: rows.reduce((n, r) => n + r.projectCount, 0),
      jobCount: rows.reduce((n, r) => n + r.jobCount, 0),
      directInvoiceCount: rows.reduce((n, r) => n + r.directInvoiceCount, 0),
    },
  }
}
