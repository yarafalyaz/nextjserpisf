import { describe, it, expect } from "vitest"
import {
  SERVICE_REMINDER_EMPTY_TEXT,
  SERVICE_REMINDER_KM_AHEAD_THRESHOLD,
  SERVICE_REMINDER_KM_NOTICE_TEXT,
  SERVICE_REMINDER_NOTICE_TEXT,
  SERVICE_REMINDER_QUEUE_TITLE,
  SERVICE_REMINDER_STATUS_LABELS,
  buildServiceReminderQueue,
  type ServiceReminderVehicleInput,
} from "../service-reminder-queue"

// 10:00 WIB 26 Okt 2026 = 03:00Z — now di luar tengah malam pada kedua zona.
const NOW = new Date("2026-10-26T03:00:00.000Z")

function day(offset: number): Date {
  return new Date(Date.UTC(2026, 9, 26) + offset * 86_400_000)
}

function input(over: Partial<ServiceReminderVehicleInput>): ServiceReminderVehicleInput {
  return {
    customerVehicleId: 1,
    nextServiceDate: null,
    nextServiceKm: null,
    nextServiceNote: null,
    lastOdometerKm: null,
    vehicleIsActive: true,
    vehicleDeletedAt: null,
    plateNumber: "B 1 AA",
    vehicleName: "Avanza",
    customerId: 1,
    customerName: "Budi",
    ...over,
  }
}

describe("service-reminder-queue (F-2026-10-25-021-S tahap 1, usulan Q-SV-1..3)", () => {
  it("kata tampil + notice verbatim", () => {
    expect(SERVICE_REMINDER_QUEUE_TITLE).toBe("Pengingat Servis Berkala")
    expect(SERVICE_REMINDER_STATUS_LABELS).toEqual({
      belum_terjadwal: "belum_terjadwal",
      terjadwal: "terjadwal",
      mendekati: "mendekati",
      terlewat: "terlewat",
      jadwal_rusak: "jadwal_rusak",
    })
    expect(SERVICE_REMINDER_NOTICE_TEXT).toBe(
      "Daftar ini menurunkan status dari jadwal servis tersimpan dan odometer terakhir tercatat. Daftar ini tidak mengubah jadwal atau status kendaraan.",
    )
    expect(SERVICE_REMINDER_KM_NOTICE_TEXT).toBe(
      "Sisa km dihitung dari odometer terakhir tercatat, bukan perkiraan odometer hari ini.",
    )
    expect(SERVICE_REMINDER_EMPTY_TEXT).toBe(
      "Tidak ada kendaraan yang mendekati atau melewati jadwal servis pada jendela ini.",
    )
    expect(SERVICE_REMINDER_KM_AHEAD_THRESHOLD).toBe(500)
  })

  it("AC-SV-B1: ketiga status jujur dari satu jadwal (tanggal)", () => {
    const queue = buildServiceReminderQueue(
      [
        input({ customerVehicleId: 1, nextServiceDate: day(5) }),
        input({ customerVehicleId: 2, nextServiceDate: day(-3) }),
        input({ customerVehicleId: 3, nextServiceDate: day(45) }),
      ],
      { now: NOW },
    )
    expect(queue.rows.map((r) => [r.customerVehicleId, r.status])).toEqual([
      [2, "terlewat"],
      [1, "mendekati"],
    ])
    expect(queue.summary).toMatchObject({ mendekati: 1, terlewat: 1, diLuarJendela: 1 })
  })

  it("AC-SV-B2: jadwal lampau terlewat tanpa mutasi; tanggal + km salah satu terpenuhi", () => {
    const queue = buildServiceReminderQueue(
      [
        input({ customerVehicleId: 1, nextServiceDate: day(-10), nextServiceKm: 99_999, lastOdometerKm: 10_000 }),
        input({ customerVehicleId: 2, nextServiceDate: day(90), nextServiceKm: 10_300, lastOdometerKm: 10_000 }),
        input({ customerVehicleId: 3, nextServiceDate: day(90), nextServiceKm: 99_999, lastOdometerKm: 10_000 }),
      ],
      { now: NOW },
    )
    // id 2 mendekati lewat sisa km 300 <= 500 walau tanggal jauh.
    expect(queue.rows.map((r) => [r.customerVehicleId, r.status])).toEqual([
      [1, "terlewat"],
      [2, "mendekati"],
    ])
    expect(queue.summary.diLuarJendela).toBe(1)
  })

  it("AC-SV-B3: odometer kosong -> sisaKm null, tidak terlewat karangan; km terlampaui -> jadwal_rusak", () => {
    const queue = buildServiceReminderQueue(
      [
        input({ customerVehicleId: 1, nextServiceKm: 10_000, lastOdometerKm: null }),
        input({ customerVehicleId: 2, nextServiceKm: 9_000, lastOdometerKm: 10_000 }),
        input({ customerVehicleId: 3, nextServiceKm: 10_000, lastOdometerKm: 10_000 }),
        input({ customerVehicleId: 4, nextServiceKm: 0, lastOdometerKm: 10_000 }),
        input({ customerVehicleId: 5, nextServiceDate: new Date(Number.NaN) }),
      ],
      { now: NOW },
    )
    // id 1: km tidak bisa dinilai -> terjadwal di luar jendela, bukan baris.
    expect(queue.rows.find((r) => r.customerVehicleId === 1)).toBeUndefined()
    expect(queue.rows.map((r) => [r.customerVehicleId, r.status, r.sisaKm])).toEqual([
      [2, "jadwal_rusak", null],
      [3, "jadwal_rusak", null],
      [4, "jadwal_rusak", null],
      [5, "jadwal_rusak", null],
    ])
    expect(queue.summary).toMatchObject({ jadwalRusak: 4, diLuarJendela: 1 })
  })

  it("tanggal lewat menang atas penanda km rusak (terlewat jujur)", () => {
    const queue = buildServiceReminderQueue(
      [input({ customerVehicleId: 1, nextServiceDate: day(-2), nextServiceKm: 9_000, lastOdometerKm: 10_000 })],
      { now: NOW },
    )
    expect(queue.rows[0]?.status).toBe("terlewat")
    expect(queue.rows[0]?.sisaHari).toBe(-2)
    // sisa km jujur tetap ditampilkan; bukan disembunyikan.
    expect(queue.rows[0]?.sisaKm).toBe(-1_000)
  })

  it("AC-SV-B3b (MEDIUM-1 QA #975): baris tampil odometer null membawa sisaKm === null persisten", () => {
    // Basis tanggal terisi membuat kendaraan MASUK baris (terlewat/
    // mendekati) sementara basis km tidak bisa dinilai karena odometer
    // null: sisaKm wajib null apa adanya di keluaran builder.
    const queue = buildServiceReminderQueue(
      [
        input({ customerVehicleId: 1, nextServiceDate: day(-1), nextServiceKm: 10_000, lastOdometerKm: null }),
        input({ customerVehicleId: 2, nextServiceDate: day(5), nextServiceKm: 10_000, lastOdometerKm: null }),
        input({ customerVehicleId: 3, nextServiceDate: day(60), nextServiceKm: 10_000, lastOdometerKm: null }),
      ],
      { now: NOW },
    )
    const byId = new Map(queue.rows.map((r) => [r.customerVehicleId, r]))
    expect(byId.get(1)).toMatchObject({ status: "terlewat", lastOdometerKm: null, sisaKm: null })
    expect(byId.get(2)).toMatchObject({ status: "mendekati", lastOdometerKm: null, sisaKm: null })
    expect(byId.get(1)?.sisaKm).toBeNull()
    expect(byId.get(2)?.sisaKm).toBeNull()
    // id 3 di luar jendela (ember), bukan baris — tidak ada sisaKm karangan.
    expect(byId.get(3)).toBeUndefined()
  })

  it("AC-SV-B4: populasi terhitung — nol baris hilang diam-diam", () => {
    const queue = buildServiceReminderQueue(
      [
        input({ customerVehicleId: 1 }),
        input({ customerVehicleId: 2, nextServiceDate: day(1) }),
        input({ customerVehicleId: 3, nextServiceDate: day(-1) }),
        input({ customerVehicleId: 4, nextServiceKm: 5_000, lastOdometerKm: 10_000 }),
        input({ customerVehicleId: 5, nextServiceDate: day(60) }),
        input({ customerVehicleId: 6, vehicleIsActive: false, nextServiceDate: day(-1) }),
        input({ customerVehicleId: 7, vehicleDeletedAt: day(-30), nextServiceDate: day(-1) }),
      ],
      { now: NOW },
    )
    const s = queue.summary
    expect(s).toEqual({
      mendekati: 1,
      terlewat: 1,
      jadwalRusak: 1,
      belumTerjadwal: 1,
      kendaraanNonaktif: 2,
      diLuarJendela: 1,
      totalKendaraanDinilai: 5,
    })
    expect(
      s.mendekati + s.terlewat + s.jadwalRusak + s.belumTerjadwal + s.diLuarJendela,
    ).toBe(s.totalKendaraanDinilai)
    expect(queue.rows).toHaveLength(3)
  })

  it("jendela tetap 7/30/90; selain itu ditolak berisik", () => {
    expect(
      buildServiceReminderQueue([input({ nextServiceDate: day(10) })], {
        now: NOW,
        windowAheadDays: 7,
      }).rows,
    ).toHaveLength(0)
    expect(() =>
      buildServiceReminderQueue([], { now: NOW, windowAheadDays: 14 }),
    ).toThrow(/7\/30\/90/)
  })

  it("batas jendela inklusif; urutan terlewat > mendekati > rusak, sisa hari naik", () => {
    const queue = buildServiceReminderQueue(
      [
        input({ customerVehicleId: 1, nextServiceDate: day(30) }),
        input({ customerVehicleId: 2, nextServiceDate: day(-1) }),
        input({ customerVehicleId: 3, nextServiceDate: day(-9) }),
        input({ customerVehicleId: 4, nextServiceDate: day(2) }),
        input({ customerVehicleId: 5, nextServiceKm: 1, lastOdometerKm: 2 }),
      ],
      { now: NOW },
    )
    expect(queue.rows.map((r) => r.customerVehicleId)).toEqual([3, 2, 4, 1, 5])
  })

  it("AC-SV-B7: sisa hari hari-kalender WIB, bukan jam mentah", () => {
    // 23:30Z = 06:30 WIB 27 Okt -> hari acuan 27 Okt, target 26 Okt = -1.
    const queue = buildServiceReminderQueue(
      [input({ customerVehicleId: 1, nextServiceDate: day(0) })],
      { now: new Date("2026-10-26T23:30:00.000Z") },
    )
    expect(queue.rows[0]?.sisaHari).toBe(-1)
    expect(queue.rows[0]?.status).toBe("terlewat")
  })
})
