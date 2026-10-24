/**
 * Builder murni antrean garansi segera berakhir
 * (F-2026-10-22-094-S, PUTUSAN Q-WX-1..5 BOT 1 di backlog §9B).
 *
 * Ember tampil TURUNAN dari status tersimpan + `expiresAt` vs hari kalender
 * WIB — BUKAN kolom baru, BUKAN mutasi status tersimpan (BR-WX-01/11):
 * - `segera_berakhir`: tersimpan `active`, 0 <= sisa hari <= jendela depan.
 * - `baru_berakhir`: sisa hari negatif dalam jendela lampau (tersimpan
 *   `active` yang belum digeser siapa pun ATAU tersimpan `expired`).
 * - `tanpa_batas_jelas`: `expiresAt` kosong/rusak — schema mewajibkan
 *   terisi, jadi ember ini penjaga cacat data yang selalu terhitung.
 * Coverage `revoked` keluar antrean; coverage kendaraan nonaktif/terhapus
 * keluar baris dan terhitung di ember `kendaraan_nonaktif` (BR-WX-08).
 *
 * Jendela FINAL Q-WX-2: default 30 depan / 30 lampau; pilihan pengguna
 * HANYA dari daftar tetap 7/30/90 (depan/lampau terpisah) — nilai lain
 * ditolak. Urutan FINAL Q-WX-3: sisa hari naik, seri `expiresAt` naik lalu
 * id coverage naik; deterministik. Izin Q-WX-1: scope eksplisit dari
 * permukaan pemanggil — `claims_page` boleh telepon, `report` TANPA
 * telepon; scope lain fail-closed (lempar error).
 *
 * Penanda klaim BR-WX-03 (satu coverage satu baris walau banyak klaim) dan
 * penanda km BR-WX-02 dari `lastOdometerKm` tercatat — BUKAN odometer hari
 * ini. Baca-saja: builder ini tidak menulis coverage/klaim apa pun.
 * Loader: `warranty-expiry-queue-data.ts`.
 */

import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

/** Judul verbatim spec §7 — UI menempel apa adanya. */
export const WARRANTY_EXPIRY_QUEUE_TITLE = "Garansi Segera Berakhir"

export const WARRANTY_EXPIRY_BUCKETS = [
  "segera_berakhir",
  "baru_berakhir",
  "tanpa_batas_jelas",
] as const

export type WarrantyExpiryBucket = (typeof WARRANTY_EXPIRY_BUCKETS)[number]

/** Label ember verbatim spec §7 — UI menempel apa adanya. */
export const WARRANTY_EXPIRY_BUCKET_LABELS: Record<WarrantyExpiryBucket, string> = {
  segera_berakhir: "Segera berakhir",
  baru_berakhir: "Baru berakhir",
  tanpa_batas_jelas: "Tanpa batas jelas",
}

export const WARRANTY_EXPIRY_INACTIVE_VEHICLE_LABEL = "Kendaraan nonaktif"
export const WARRANTY_EXPIRY_NO_SERIAL_LABEL = "tanpa serial tercatat"
export const WARRANTY_EXPIRY_KM_LIMIT_LABEL =
  "Batas km menurut odometer terakhir tercatat"

/** Notice jujur verbatim spec §7 — UI menempel apa adanya. */
export const WARRANTY_EXPIRY_NOTICE_TEXT =
  "Daftar ini membaca tanggal berakhir cakupan garansi. Status tersimpan tidak diubah oleh daftar ini."
export const WARRANTY_EXPIRY_CONTACT_NOTICE_TEXT =
  "Menghubungi pelanggan dicatat sebagai tautan dibuka, bukan pesan terkirim."
export const WARRANTY_EXPIRY_EMPTY_TEXT =
  "Tidak ada garansi yang segera berakhir pada jendela ini."

export const WARRANTY_CLAIM_MARKERS = [
  "ada_klaim_terbuka",
  "pernah_klaim",
  "belum_pernah_klaim",
] as const

export type WarrantyClaimMarker = (typeof WARRANTY_CLAIM_MARKERS)[number]

/** Label penanda klaim verbatim spec §7 — UI menempel apa adanya. */
export const WARRANTY_CLAIM_MARKER_LABELS: Record<WarrantyClaimMarker, string> = {
  ada_klaim_terbuka: "Ada klaim terbuka",
  pernah_klaim: "Pernah klaim",
  belum_pernah_klaim: "Belum pernah klaim",
}

/** Permukaan tampil Q-WX-1/Q-WX-3: kartu klaim vs halaman laporan. */
export const WARRANTY_EXPIRY_SCOPES = ["claims_page", "report"] as const

export type WarrantyExpiryScope = (typeof WARRANTY_EXPIRY_SCOPES)[number]

/** Jendela hari yang BOLEH dipilih pengguna (Q-WX-2, daftar tetap). */
export const WARRANTY_EXPIRY_WINDOW_CHOICES = [7, 30, 90] as const

export const WARRANTY_EXPIRY_DEFAULT_WINDOW_AHEAD_DAYS = 30
export const WARRANTY_EXPIRY_DEFAULT_WINDOW_PAST_DAYS = 30

const MS_PER_DAY = 86_400_000

/** Status klaim terminal BR-WX-03: `closed` dan `rejected`. */
const TERMINAL_CLAIM_STATUSES = new Set(["closed", "rejected"])

export interface WarrantyExpiryCoverageInput {
  coverageId: number
  /** Status tersimpan coverage: active/expired/revoked (BR-WX-01). */
  storedStatus: string
  /** Null/rusak = ember `tanpa_batas_jelas` (penjaga cacat data). */
  expiresAt: Date | null
  installedAt: Date | null
  warrantyMonths: number | null
  serialNumber: string | null
  mileageLimitKm: number | null
  customerVehicleId: number
  plateNumber: string | null
  vehicleName: string | null
  /** Kendaraan nonaktif/terhapus → ember `kendaraan_nonaktif` (BR-WX-08). */
  vehicleIsActive: boolean
  vehicleDeletedAt: Date | null
  /** Odometer terakhir tercatat (snapshot check-in), BUKAN hari ini. */
  lastOdometerKm: number | null
  customerId: number
  customerName: string
  /** Kontak — loader hanya mengisi di permukaan klaim; builder menutup di `report`. */
  customerPhone: string | null
  itemId: number
  itemName: string
  itemSku: string
  workOrderId: number
  /** Status seluruh klaim coverage ini (BR-WX-03). */
  claimStatuses: readonly string[]
}

export interface WarrantyExpiryRow {
  coverageId: number
  ember: WarrantyExpiryBucket
  emberLabel: string
  /** Status tersimpan apa adanya — loader tidak pernah menggesernya. */
  storedStatus: string
  expiresAt: Date | null
  installedAt: Date | null
  warrantyMonths: number | null
  /** Hari kalender WIB sampai expiresAt; negatif = hari lewat. Null bila tanpa batas jelas. */
  sisaHari: number | null
  serialNumber: string | null
  serialLabel: string
  mileageLimitKm: number | null
  lastOdometerKm: number | null
  /** BR-WX-02: batas km tercapai menurut odometer terakhir tercatat. */
  batasKmTercapai: boolean
  batasKmLabel: string | null
  customerVehicleId: number
  plateNumber: string | null
  vehicleName: string | null
  customerId: number
  customerName: string
  /** Hanya permukaan `claims_page`; permukaan `report` selalu null (Q-WX-1). */
  customerPhone: string | null
  itemId: number
  itemName: string
  itemSku: string
  workOrderId: number
  penandaKlaim: WarrantyClaimMarker
  penandaKlaimLabel: string
  claimCount: number
  openClaimCount: number
}

export interface WarrantyExpirySummary {
  segeraBerakhir: number
  baruBerakhir: number
  tanpaBatasJelas: number
  kendaraanNonaktif: number
  /** Di luar jendela terpilih (depan/lampau) — tidak tampil sebagai baris. */
  diLuarJendela: number
  /**
   * Penyebut ringkasan BR-WX-09: populasi active/expired sesudah saringan
   * kendaraan nonaktif (termasuk yang di luar jendela).
   */
  totalCoverageDinilai: number
}

export interface WarrantyExpiryQueue {
  rows: WarrantyExpiryRow[]
  summary: WarrantyExpirySummary
  windowAheadDays: number
  windowPastDays: number
  scope: WarrantyExpiryScope
}

export interface WarrantyExpiryOptions {
  scope: WarrantyExpiryScope
  now?: Date
  windowAheadDays?: number
  windowPastDays?: number
}

function assertWindow(value: number, field: string): void {
  if (!(WARRANTY_EXPIRY_WINDOW_CHOICES as readonly number[]).includes(value)) {
    throw new Error(
      `Jendela ${field} antrean garansi harus salah satu dari 7/30/90 hari; akses ditolak.`,
    )
  }
}

function claimMarker(claimStatuses: readonly string[]): {
  penandaKlaim: WarrantyClaimMarker
  openClaimCount: number
} {
  const openClaimCount = claimStatuses.filter(
    (status) => !TERMINAL_CLAIM_STATUSES.has(status),
  ).length
  if (claimStatuses.length === 0) {
    return { penandaKlaim: "belum_pernah_klaim", openClaimCount: 0 }
  }
  if (openClaimCount > 0) return { penandaKlaim: "ada_klaim_terbuka", openClaimCount }
  return { penandaKlaim: "pernah_klaim", openClaimCount: 0 }
}

export function buildWarrantyExpiryQueue(
  inputs: readonly WarrantyExpiryCoverageInput[],
  options: WarrantyExpiryOptions,
): WarrantyExpiryQueue {
  if (!(WARRANTY_EXPIRY_SCOPES as readonly string[]).includes(options.scope)) {
    throw new Error("Scope antrean garansi tidak dikenal; akses ditolak.")
  }
  const windowAheadDays =
    options.windowAheadDays ?? WARRANTY_EXPIRY_DEFAULT_WINDOW_AHEAD_DAYS
  const windowPastDays =
    options.windowPastDays ?? WARRANTY_EXPIRY_DEFAULT_WINDOW_PAST_DAYS
  assertWindow(windowAheadDays, "ke depan")
  assertWindow(windowPastDays, "lampau")

  const includePhone = options.scope === "claims_page"
  const today = getWibTodayUtcDate(options.now ?? new Date())

  const summary: WarrantyExpirySummary = {
    segeraBerakhir: 0,
    baruBerakhir: 0,
    tanpaBatasJelas: 0,
    kendaraanNonaktif: 0,
    diLuarJendela: 0,
    totalCoverageDinilai: 0,
  }
  const rows: WarrantyExpiryRow[] = []

  for (const input of inputs) {
    // BR-WX-01: revoked (dan status tak dikenal) tidak masuk antrean.
    if (input.storedStatus !== "active" && input.storedStatus !== "expired") continue
    // BR-WX-08: kendaraan nonaktif/terhapus keluar baris, tetap terhitung.
    if (!input.vehicleIsActive || input.vehicleDeletedAt != null) {
      summary.kendaraanNonaktif += 1
      continue
    }
    summary.totalCoverageDinilai += 1

    const expiresAt =
      input.expiresAt != null && !Number.isNaN(input.expiresAt.getTime())
        ? input.expiresAt
        : null

    let ember: WarrantyExpiryBucket
    let sisaHari: number | null
    if (expiresAt == null) {
      ember = "tanpa_batas_jelas"
      sisaHari = null
      summary.tanpaBatasJelas += 1
    } else {
      // BR-WX-11: bandingkan hari kalender WIB, bukan timestamp mentah.
      const expiryDay = getWibTodayUtcDate(expiresAt)
      sisaHari = Math.round((expiryDay.getTime() - today.getTime()) / MS_PER_DAY)
      if (sisaHari < 0) {
        if (sisaHari < -windowPastDays) {
          summary.diLuarJendela += 1
          continue
        }
        ember = "baru_berakhir"
        summary.baruBerakhir += 1
      } else if (input.storedStatus === "active") {
        if (sisaHari > windowAheadDays) {
          summary.diLuarJendela += 1
          continue
        }
        ember = "segera_berakhir"
        summary.segeraBerakhir += 1
      } else {
        // Tersimpan expired tetapi tanggal berakhir masih di depan:
        // data tidak konsisten — bukan segera berakhir (itu khusus active).
        summary.diLuarJendela += 1
        continue
      }
    }

    const { penandaKlaim, openClaimCount } = claimMarker(input.claimStatuses)
    const batasKmTercapai =
      input.mileageLimitKm != null &&
      input.lastOdometerKm != null &&
      input.lastOdometerKm >= input.mileageLimitKm
    const serialNumber =
      input.serialNumber != null && input.serialNumber !== "" ? input.serialNumber : null

    rows.push({
      coverageId: input.coverageId,
      ember,
      emberLabel: WARRANTY_EXPIRY_BUCKET_LABELS[ember],
      storedStatus: input.storedStatus,
      expiresAt,
      installedAt: input.installedAt,
      warrantyMonths: input.warrantyMonths,
      sisaHari,
      serialNumber,
      serialLabel: serialNumber ?? WARRANTY_EXPIRY_NO_SERIAL_LABEL,
      mileageLimitKm: input.mileageLimitKm,
      lastOdometerKm: input.lastOdometerKm,
      batasKmTercapai,
      batasKmLabel: batasKmTercapai ? WARRANTY_EXPIRY_KM_LIMIT_LABEL : null,
      customerVehicleId: input.customerVehicleId,
      plateNumber: input.plateNumber,
      vehicleName: input.vehicleName,
      customerId: input.customerId,
      customerName: input.customerName,
      customerPhone: includePhone ? input.customerPhone : null,
      itemId: input.itemId,
      itemName: input.itemName,
      itemSku: input.itemSku,
      workOrderId: input.workOrderId,
      penandaKlaim,
      penandaKlaimLabel: WARRANTY_CLAIM_MARKER_LABELS[penandaKlaim],
      claimCount: input.claimStatuses.length,
      openClaimCount,
    })
  }

  // Q-WX-3: sisa hari naik; seri expiresAt naik lalu id naik. Baris tanpa
  // sisa hari (tanpa batas jelas) sesudah baris bertanggal.
  rows.sort((a, b) => {
    const sisaA = a.sisaHari ?? Number.POSITIVE_INFINITY
    const sisaB = b.sisaHari ?? Number.POSITIVE_INFINITY
    if (sisaA !== sisaB) return sisaA - sisaB
    const expiryA = a.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY
    const expiryB = b.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY
    if (expiryA !== expiryB) return expiryA - expiryB
    return a.coverageId - b.coverageId
  })

  return { rows, summary, windowAheadDays, windowPastDays, scope: options.scope }
}
