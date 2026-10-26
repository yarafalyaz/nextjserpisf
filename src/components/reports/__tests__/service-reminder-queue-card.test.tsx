// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import type { Root } from "react-dom/client"
import { ServiceReminderQueueCard } from "../service-reminder-queue-card"
import {
  buildServiceReminderQueue,
  SERVICE_REMINDER_EMPTY_TEXT,
  SERVICE_REMINDER_KM_NOTICE_TEXT,
  SERVICE_REMINDER_NOTICE_TEXT,
  SERVICE_REMINDER_QUEUE_TITLE,
} from "@/lib/reports/service-reminder-queue"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"
import {
  SERVICE_REMINDER_NOW as NOW,
  serviceReminderDay as day,
  serviceReminderInput as input,
} from "@/lib/reports/__tests__/service-reminder-test-fixtures"

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => unmountCard(root))
  roots = []
  clearRenderedCards()
})

describe("ServiceReminderQueueCard F-2026-10-25-021-S", () => {
  it("status/sisa/ember verbatim builder; urutan builder dipertahankan; ember terhitung semua; sisa km null = penanda jujur; baca-saja tanpa telepon", () => {
    const queue = buildServiceReminderQueue(
      [
        input({
          customerVehicleId: 1,
          customerName: "Budi Terlewat",
          plateNumber: "B 100 AA",
          nextServiceDate: day(-2),
          nextServiceKm: 52000,
          nextServiceNote: "ganti oli",
          lastOdometerKm: 51000,
        }),
        input({
          customerVehicleId: 2,
          customerName: "Citra Mendekati",
          plateNumber: "B 200 BB",
          nextServiceDate: day(10),
          nextServiceKm: null,
          lastOdometerKm: null,
        }),
        input({
          customerVehicleId: 3,
          customerName: "Dedi Rusak",
          plateNumber: "B 300 CC",
          nextServiceDate: null,
          nextServiceKm: 40000,
          lastOdometerKm: 45000,
        }),
        input({
          customerVehicleId: 4,
          customerName: "Eka Belum",
          nextServiceDate: null,
          nextServiceKm: null,
        }),
        input({
          customerVehicleId: 5,
          customerName: "Fajar Nonaktif",
          vehicleIsActive: false,
        }),
        input({
          customerVehicleId: 6,
          customerName: "Gita Jauh",
          nextServiceDate: day(60),
        }),
      ],
      { now: NOW },
    )
    const { container, root } = renderCard(<ServiceReminderQueueCard queue={queue} />)
    roots.push(root)
    const text = container.textContent ?? ""

    expect(container.querySelector(`[aria-label="${SERVICE_REMINDER_QUEUE_TITLE}"]`)).not.toBeNull()
    expect(text).toContain(SERVICE_REMINDER_QUEUE_TITLE)
    expect(text).toContain(SERVICE_REMINDER_NOTICE_TEXT)
    expect(text).toContain(SERVICE_REMINDER_KM_NOTICE_TEXT)
    // Ember terhitung semua tampil (nol baris hilang diam-diam).
    expect(text).toContain("1 terlewat")
    expect(text).toContain("1 mendekati")
    expect(text).toContain("1 jadwal_rusak")
    expect(text).toContain("1 belum_terjadwal")
    expect(text).toContain("1 kendaraan_nonaktif")
    expect(text).toContain("1 di luar jendela")
    expect(text).toContain("5 kendaraan dinilai")
    // Label status verbatim payload.
    expect(text).toContain("terlewat")
    expect(text).toContain("mendekati")
    expect(text).toContain("jadwal_rusak")
    // Sisa verbatim builder: tanggal terlewat negatif, km dinilai dari odometer.
    expect(text).toContain("-2 hari")
    expect(text).toContain("10 hari")
    expect(text).toContain("1.000 km")
    // sisaKm null (odometer belum tercatat) = penanda jujur, bukan 0.
    expect(text).toContain("Tidak bisa dinilai")
    // Baris hanya antrean: belum_terjadwal/nonaktif/di-luar-jendela bukan baris.
    expect(text).toContain("Budi Terlewat")
    expect(text).toContain("Citra Mendekati")
    expect(text).toContain("Dedi Rusak")
    expect(text).not.toContain("Eka Belum")
    expect(text).not.toContain("Fajar Nonaktif")
    expect(text).not.toContain("Gita Jauh")
    // Urutan builder: terlewat dulu, lalu mendekati, lalu jadwal_rusak.
    expect(text.indexOf("Budi Terlewat")).toBeLessThan(text.indexOf("Citra Mendekati"))
    expect(text.indexOf("Citra Mendekati")).toBeLessThan(text.indexOf("Dedi Rusak"))
    // Baca-saja total + tanpa telepon (BR-SV-06).
    expect(container.querySelector("form")).toBeNull()
    expect(container.querySelector("button")).toBeNull()
    expect(container.querySelector("input")).toBeNull()
    expect(text).not.toMatch(/08\d{8,}/)
  })

  it("kosong: teks kosong verbatim builder", () => {
    const queue = buildServiceReminderQueue([], { now: NOW })
    const { container, root } = renderCard(<ServiceReminderQueueCard queue={queue} />)
    roots.push(root)
    const text = container.textContent ?? ""
    expect(text).toContain(SERVICE_REMINDER_EMPTY_TEXT)
    expect(container.querySelector("table")).toBeNull()
  })
})
