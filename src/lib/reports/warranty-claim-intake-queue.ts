/**
 * Builder murni antrean klaim garansi intake mengendap
 * (F-2026-10-27-076-S, PUTUSAN LEAD Q-WIQ-1..6 di backlog §8).
 *
 * Populasi: WarrantyClaim status `intake` saja (BR-WIQ-01). Tingkat TURUNAN
 * dari umur hari kalender WIB sejak `reportedAt` (BR-WIQ-05, acuan BUKAN
 * createdAt/expiresAt):
 * - `mengendap`: umur >= WARRANTY_INTAKE_STALE_DAYS (Q-WIQ-1 = 3).
 * - `menunggu`: intake selain itu.
 * reportedAt masa depan → umur 0 tertanda, bukan negatif (EC-WIQ-4).
 * Urutan Q-WIQ-3: `mengendap` dulu, lalu umur tertua; seri reportedAt sama
 * persis → id klaim naik. Klaim atas cakupan expired/revoked TETAP populasi
 * tertanda (statusCakupan + laporDiLuarMasa), bukan saringan (BR-WIQ-06).
 * Baca-saja: builder tidak memanggil transisi/keputusan/buat klaim apa pun
 * (BR-WIQ-09, Q-WIQ-4). Payload nol nominal biaya, nol telepon pelanggan,
 * nol penanda penanggung jawab (BR-WIQ-04, Q-WIQ-6).
 * Loader: `warranty-claim-intake-queue-data.ts`.
 */

import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

/** Judul kolom verbatim spec §1 (Q-WIQ-2) — UI menempel apa adanya. */
export const WARRANTY_INTAKE_QUEUE_TITLE = "Antrean Klaim Garansi Intake"

export const WARRANTY_INTAKE_COLUMN_LABELS = {
  umur: "Menunggu Penilaian",
  pelanggan: "Pelanggan",
  kendaraan: "Kendaraan",
  part: "Part Tercakup",
  dilaporkan: "Dilaporkan",
  dibuatOleh: "Dibuat Oleh",
} as const

export const WARRANTY_INTAKE_LEVELS = ["mengendap", "menunggu"] as const

export type WarrantyIntakeLevel = (typeof WARRANTY_INTAKE_LEVELS)[number]

/** Label tingkat verbatim spec §1 (Q-WIQ-2) — UI menempel apa adanya. */
export const WARRANTY_INTAKE_LEVEL_LABELS: Record<WarrantyIntakeLevel, string> = {
  mengendap: "Mengendap",
  menunggu: "Menunggu Penilaian",
}

/** Notice verbatim spec §1 (Q-WIQ-2) — UI menempel apa adanya. */
export const WARRANTY_INTAKE_NOTICE_TEXT =
  "Daftar ini hanya klaim garansi yang masih intake dan belum masuk penilaian eligibility. Klaim tetap wajib dinilai dan diputus manual oleh pejabat; majukan lewat detail klaim."

export const WARRANTY_INTAKE_EMPTY_TEXT = "Tidak ada klaim garansi intake."

/** Ambang mengendap Q-WIQ-1: satu-satunya tempat angka ini hidup. */
export const WARRANTY_INTAKE_STALE_DAYS = 3

export const WARRANTY_INTAKE_NO_CREATOR_LABEL = "—"
export const WARRANTY_INTAKE_NO_ODOMETER_LABEL = "—"

const MS_PER_DAY = 86_400_000

export interface WarrantyIntakeClaimInput {
  claimId: number
  /** Status klaim pelanggan; hanya `intake` populasi (BR-WIQ-01/07). */
  status: string
  reportedAt: Date
  odometerKm: number | null
  complaint: string
  createdByName: string | null
  coverageId: number
  /** Status cakupan apa adanya: active/expired/revoked (BR-WIQ-06). */
  coverageStatus: string
  coverageExpiresAt: Date
  serialNumber: string | null
  itemId: number
  itemName: string
  itemSku: string
  customerVehicleId: number
  plateNumber: string | null
  vehicleName: string | null
  customerId: number
  customerName: string
}

export interface WarrantyIntakeRow {
  claimId: number
  level: WarrantyIntakeLevel
  levelLabel: string
  /** Hari kalender WIB sejak reportedAt; masa depan = 0 (EC-WIQ-4). */
  umurIntakeHari: number
  reportedAt: Date
  /** reportedAt sesudah expiresAt cakupan — penanda fakta, bukan vonis. */
  laporDiLuarMasa: boolean
  statusCakupan: string
  coverageId: number
  coverageExpiresAt: Date
  serialNumber: string | null
  odometerKm: number | null
  complaint: string
  createdByName: string | null
  itemId: number
  itemName: string
  itemSku: string
  customerVehicleId: number
  plateNumber: string | null
  vehicleName: string | null
  customerId: number
  customerName: string
}

export interface WarrantyIntakeSummary {
  mengendap: number
  menunggu: number
  totalIntake: number
}

export interface WarrantyIntakeQueue {
  rows: WarrantyIntakeRow[]
  summary: WarrantyIntakeSummary
  staleDays: number
}

export interface WarrantyIntakeOptions {
  now?: Date
}

export function buildWarrantyIntakeQueue(
  inputs: readonly WarrantyIntakeClaimInput[],
  options: WarrantyIntakeOptions = {},
): WarrantyIntakeQueue {
  const today = getWibTodayUtcDate(options.now ?? new Date())
  const rows: WarrantyIntakeRow[] = []

  for (const input of inputs) {
    // BR-WIQ-01: populasi hanya status intake; status lain di luar antrean.
    if (input.status !== "intake") continue

    const reportedDay = getWibTodayUtcDate(input.reportedAt)
    const rawDays = Math.round((today.getTime() - reportedDay.getTime()) / MS_PER_DAY)
    const umurIntakeHari = Math.max(0, rawDays)
    const level: WarrantyIntakeLevel =
      umurIntakeHari >= WARRANTY_INTAKE_STALE_DAYS ? "mengendap" : "menunggu"

    rows.push({
      claimId: input.claimId,
      level,
      levelLabel: WARRANTY_INTAKE_LEVEL_LABELS[level],
      umurIntakeHari,
      reportedAt: input.reportedAt,
      laporDiLuarMasa: input.reportedAt.getTime() > input.coverageExpiresAt.getTime(),
      statusCakupan: input.coverageStatus,
      coverageId: input.coverageId,
      coverageExpiresAt: input.coverageExpiresAt,
      serialNumber:
        input.serialNumber != null && input.serialNumber !== "" ? input.serialNumber : null,
      odometerKm: input.odometerKm,
      complaint: input.complaint,
      createdByName: input.createdByName,
      itemId: input.itemId,
      itemName: input.itemName,
      itemSku: input.itemSku,
      customerVehicleId: input.customerVehicleId,
      plateNumber: input.plateNumber,
      vehicleName: input.vehicleName,
      customerId: input.customerId,
      customerName: input.customerName,
    })
  }

  // Q-WIQ-3: mengendap dulu, lalu umur tertua (reportedAt naik), seri id naik.
  rows.sort((a, b) => {
    if (a.level !== b.level) return a.level === "mengendap" ? -1 : 1
    if (a.umurIntakeHari !== b.umurIntakeHari) return b.umurIntakeHari - a.umurIntakeHari
    const reportedA = a.reportedAt.getTime()
    const reportedB = b.reportedAt.getTime()
    if (reportedA !== reportedB) return reportedA - reportedB
    return a.claimId - b.claimId
  })

  const summary: WarrantyIntakeSummary = {
    mengendap: rows.filter((r) => r.level === "mengendap").length,
    menunggu: rows.filter((r) => r.level === "menunggu").length,
    totalIntake: rows.length,
  }

  return { rows, summary, staleDays: WARRANTY_INTAKE_STALE_DAYS }
}
