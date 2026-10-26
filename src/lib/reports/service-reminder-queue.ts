/**
 * Builder murni antrean pengingat servis berkala per kendaraan
 * (F-2026-10-25-021-S tahap 1, spec PR #826 MERGED 272d83da).
 *
 * Status pengingat TURUNAN baca-saja dari jadwal tersimpan di master
 * kendaraan (CustomerVehicle.nextServiceDate/nextServiceKm) vs hari
 * kalender WIB dan vs `lastOdometerKm` terakhir tercatat — BUKAN kolom
 * status, BUKAN mutasi (BR-SV-01). Antrean ini tidak pernah menulis
 * jadwal/status kendaraan (AC-SV-B5). Domain TERPISAH dari antrean
 * garansi F-2026-10-22-094-S (BR-SV-10): jangan campur builder ini ke
 * warranty-expiry-queue.
 *
 * Gerbang putusan Lead Q-SV-1/2/3 BELUM tertulis saat fisik dibangun
 * (verifikasi live 26 Okt 2026: grep backlog+board origin/main c72ad0ff
 * untuk Q-SV = hanya pertanyaan spec, tanpa putusan). Diambil usulan
 * spec §3/§7 yang paling aman, semua bisa diubah tanpa migrasi:
 * - Q-SV-1: tahap 1 baca-saja + pencatatan master manual (aksi terpisah
 *   di vehicle.actions.ts, bukan builder ini).
 * - Q-SV-2: tanpa key izin baru — loader reuse `view_reports`
 *   (pola warranty-expiry-queue-data report scope).
 * - Q-SV-3: jendela depan daftar tetap 7/30/90 hari (default 30) +
 *   ambang km depan konstanta bernama di bawah; angka final milik Lead,
 *   ubah konstanta ini saja bila Lead memutus lain.
 * Q-SV-4 (penanda tindak-lanjut tersimpan / geser otomatis oleh WO)
 * tahap 2 terpisah — DILARANG di sini (BR-SV-07).
 *
 * Aturan turunan (BR-SV-03): jadwal boleh tanggal saja, km saja, atau
 * keduanya; kendaraan `mendekati`/`terlewat` bila SALAH SATU basis yang
 * terisi terpenuhi. Sisa km HANYA dari `lastOdometerKm` (BR-SV-04):
 * odometer null + km target terisi = tidak bisa dinilai km (penanda
 * jujur, bukan 0, bukan terlewat karangan — AC-SV-B3). Sisa km <= 0 =
 * target tercapai = `terlewat` (BR-SV-03; penjaga pintu masuk menolak
 * km target <= odometer terakhir SAAT DICATAT, jadi data sah tidak
 * lahir rusak — sisa <= 0 kemudian berarti target terlampaui).
 *
 * Ember terhitung (BR-SV-05, AC-SV-B4): kendaraan nonaktif/terhapus
 * keluar baris masuk `kendaraan_nonaktif`; tanpa jadwal masuk
 * `belum_terjadwal`; jadwal rusak masuk `jadwal_rusak`. Nol baris
 * hilang diam-diam: total populasi = baris tampil + semua ember +
 * terjadwal-di-luar-jendela.
 *
 * Hari acuan = hari kalender WIB (`getWibTodayUtcDate`, AC-SV-B7).
 * Waktu diinjeksikan pemanggil sebagai `now`; builder tidak membaca
 * jam sistem. Pure (tanpa Prisma/DOM). Loader:
 * `service-reminder-queue-data.ts` (anti-N+1, tanpa telepon BR-SV-06).
 */

import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

/** Judul verbatim — UI menempel apa adanya. */
export const SERVICE_REMINDER_QUEUE_TITLE = "Pengingat Servis Berkala"

export const SERVICE_REMINDER_STATUSES = [
  "belum_terjadwal",
  "terjadwal",
  "mendekati",
  "terlewat",
  "jadwal_rusak",
] as const

export type ServiceReminderStatus = (typeof SERVICE_REMINDER_STATUSES)[number]

/** Label kata spec §3 verbatim — UI menempel apa adanya. */
export const SERVICE_REMINDER_STATUS_LABELS: Record<ServiceReminderStatus, string> = {
  belum_terjadwal: "belum_terjadwal",
  terjadwal: "terjadwal",
  mendekati: "mendekati",
  terlewat: "terlewat",
  jadwal_rusak: "jadwal_rusak",
}

export const SERVICE_REMINDER_INACTIVE_LABEL = "kendaraan_nonaktif"

/** Notice jujur — UI menempel apa adanya. */
export const SERVICE_REMINDER_NOTICE_TEXT =
  "Daftar ini menurunkan status dari jadwal servis tersimpan dan odometer terakhir tercatat. Daftar ini tidak mengubah jadwal atau status kendaraan."
export const SERVICE_REMINDER_KM_NOTICE_TEXT =
  "Sisa km dihitung dari odometer terakhir tercatat, bukan perkiraan odometer hari ini."
export const SERVICE_REMINDER_EMPTY_TEXT =
  "Tidak ada kendaraan yang mendekati atau melewati jadwal servis pada jendela ini."

/** Jendela hari yang BOLEH dipilih pengguna (usulan Q-SV-3, daftar tetap pola Q-WX-2). */
export const SERVICE_REMINDER_WINDOW_CHOICES = [7, 30, 90] as const

export const SERVICE_REMINDER_DEFAULT_WINDOW_AHEAD_DAYS = 30

/**
 * Ambang km depan (usulan Q-SV-3, konstanta bernama): sisa km <= nilai
 * ini = mendekati. Angka final milik Lead — ubah di sini saja.
 */
export const SERVICE_REMINDER_KM_AHEAD_THRESHOLD = 500

const MS_PER_DAY = 86_400_000

export interface ServiceReminderVehicleInput {
  customerVehicleId: number
  /** Jadwal servis berikutnya tersimpan; keduanya null = belum_terjadwal. */
  nextServiceDate: Date | null
  nextServiceKm: number | null
  nextServiceNote: string | null
  /** Odometer terakhir tercatat (snapshot WO); null = belum pernah tercatat. */
  lastOdometerKm: number | null
  /** Kendaraan nonaktif/terhapus → ember kendaraan_nonaktif (BR-SV-05). */
  vehicleIsActive: boolean
  vehicleDeletedAt: Date | null
  plateNumber: string | null
  vehicleName: string | null
  customerId: number
  customerName: string
}

export interface ServiceReminderRow {
  customerVehicleId: number
  status: ServiceReminderStatus
  statusLabel: string
  nextServiceDate: Date | null
  nextServiceKm: number | null
  nextServiceNote: string | null
  lastOdometerKm: number | null
  /** Sisa hari kalender WIB sampai tanggal target; negatif = lewat. Null bila tanpa tanggal. */
  sisaHari: number | null
  /** Sisa km dari odometer terakhir tercatat; null bila tidak bisa dinilai (BR-SV-04). */
  sisaKm: number | null
  plateNumber: string | null
  vehicleName: string | null
  customerId: number
  customerName: string
}

export interface ServiceReminderSummary {
  mendekati: number
  terlewat: number
  jadwalRusak: number
  belumTerjadwal: number
  kendaraanNonaktif: number
  /** Terjadwal sah tapi belum masuk jendela depan terpilih. */
  diLuarJendela: number
  /** Penyebut: populasi aktif sesudah saringan kendaraan nonaktif. */
  totalKendaraanDinilai: number
}

export interface ServiceReminderQueue {
  rows: ServiceReminderRow[]
  summary: ServiceReminderSummary
  windowAheadDays: number
  kmAheadThreshold: number
}

export interface ServiceReminderOptions {
  now?: Date
  windowAheadDays?: number
  kmAheadThreshold?: number
}

function assertWindow(value: number): void {
  if (!(SERVICE_REMINDER_WINDOW_CHOICES as readonly number[]).includes(value)) {
    throw new Error(
      "Jendela antrean pengingat servis harus salah satu dari 7/30/90 hari; akses ditolak.",
    )
  }
}

function validDate(value: Date | null): Date | null {
  return value != null && !Number.isNaN(value.getTime()) ? value : null
}

export function buildServiceReminderQueue(
  inputs: readonly ServiceReminderVehicleInput[],
  options: ServiceReminderOptions = {},
): ServiceReminderQueue {
  const windowAheadDays = options.windowAheadDays ?? SERVICE_REMINDER_DEFAULT_WINDOW_AHEAD_DAYS
  assertWindow(windowAheadDays)
  const kmAheadThreshold = options.kmAheadThreshold ?? SERVICE_REMINDER_KM_AHEAD_THRESHOLD
  if (!Number.isFinite(kmAheadThreshold) || kmAheadThreshold < 0) {
    throw new Error("Ambang km antrean pengingat servis tidak valid; akses ditolak.")
  }

  const today = getWibTodayUtcDate(options.now ?? new Date())

  const summary: ServiceReminderSummary = {
    mendekati: 0,
    terlewat: 0,
    jadwalRusak: 0,
    belumTerjadwal: 0,
    kendaraanNonaktif: 0,
    diLuarJendela: 0,
    totalKendaraanDinilai: 0,
  }
  const rows: ServiceReminderRow[] = []

  for (const input of inputs) {
    // BR-SV-05: kendaraan nonaktif/terhapus keluar baris, tetap terhitung.
    if (!input.vehicleIsActive || input.vehicleDeletedAt != null) {
      summary.kendaraanNonaktif += 1
      continue
    }
    summary.totalKendaraanDinilai += 1

    const nextServiceDate = validDate(input.nextServiceDate)
    const dateInvalid = input.nextServiceDate != null && nextServiceDate == null
    const nextServiceKm = input.nextServiceKm
    const kmInvalid =
      nextServiceKm != null && (!Number.isFinite(nextServiceKm) || nextServiceKm <= 0)

    // Jadwal rusak: HANYA tanggal/km target tidak valid (BR-SV-03/spec §3).
    // Sisa km <= 0 BUKAN rusak: penjaga pintu masuk menolak km target
    // <= odometer terakhir saat dicatat, jadi sisa <= 0 kemudian =
    // target tercapai sesudah pencatatan = terlewat (cabang di bawah).
    const sisaKmRaw =
      nextServiceKm != null && !kmInvalid && input.lastOdometerKm != null
        ? nextServiceKm - input.lastOdometerKm
        : null
    const sisaHariRaw =
      nextServiceDate != null
        ? Math.round(
            (getWibTodayUtcDate(nextServiceDate).getTime() - today.getTime()) / MS_PER_DAY,
          )
        : null

    let status: ServiceReminderStatus
    if (dateInvalid || kmInvalid) {
      status = "jadwal_rusak"
    } else if (nextServiceDate == null && nextServiceKm == null) {
      status = "belum_terjadwal"
    } else if (sisaHariRaw != null && sisaHariRaw < 0) {
      status = "terlewat"
    } else if (sisaKmRaw != null && sisaKmRaw <= 0) {
      // Km target tercapai/terlampaui odometer tercatat (BR-SV-03):
      // terlewat; sisaKm tampil apa adanya (0/negatif) dari odometer,
      // bukan perkiraan (BR-SV-04).
      status = "terlewat"
    } else if (
      (sisaHariRaw != null && sisaHariRaw <= windowAheadDays) ||
      (sisaKmRaw != null && sisaKmRaw <= kmAheadThreshold)
    ) {
      status = "mendekati"
    } else {
      status = "terjadwal"
    }

    if (status === "belum_terjadwal") {
      summary.belumTerjadwal += 1
      continue
    }
    if (status === "jadwal_rusak") {
      summary.jadwalRusak += 1
    } else if (status === "terlewat") {
      summary.terlewat += 1
    } else if (status === "mendekati") {
      summary.mendekati += 1
    } else {
      summary.diLuarJendela += 1
      continue
    }

    rows.push({
      customerVehicleId: input.customerVehicleId,
      status,
      statusLabel: SERVICE_REMINDER_STATUS_LABELS[status],
      nextServiceDate,
      nextServiceKm,
      nextServiceNote: input.nextServiceNote,
      lastOdometerKm: input.lastOdometerKm,
      sisaHari: sisaHariRaw,
      // BR-SV-04: sisa km hanya dari lastOdometerKm; null = tidak dinilai.
      sisaKm: status === "jadwal_rusak" ? null : sisaKmRaw,
      plateNumber: input.plateNumber,
      vehicleName: input.vehicleName,
      customerId: input.customerId,
      customerName: input.customerName,
    })
  }

  // Urutan deterministik: terlewat dulu (paling mendesak), lalu mendekati,
  // lalu jadwal_rusak; dalam kelompok sama sisa hari naik (null terakhir),
  // seri sisa km naik (null terakhir), lalu id naik.
  const statusRank: Record<ServiceReminderStatus, number> = {
    terlewat: 0,
    mendekati: 1,
    jadwal_rusak: 2,
    terjadwal: 3,
    belum_terjadwal: 4,
  }
  rows.sort((a, b) => {
    const rank = statusRank[a.status] - statusRank[b.status]
    if (rank !== 0) return rank
    const hariA = a.sisaHari ?? Number.POSITIVE_INFINITY
    const hariB = b.sisaHari ?? Number.POSITIVE_INFINITY
    if (hariA !== hariB) return hariA - hariB
    const kmA = a.sisaKm ?? Number.POSITIVE_INFINITY
    const kmB = b.sisaKm ?? Number.POSITIVE_INFINITY
    if (kmA !== kmB) return kmA - kmB
    return a.customerVehicleId - b.customerVehicleId
  })

  return { rows, summary, windowAheadDays, kmAheadThreshold }
}
