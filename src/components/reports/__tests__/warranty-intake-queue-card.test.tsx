// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import type { Root } from "react-dom/client"
import { WarrantyIntakeQueueCard } from "../warranty-intake-queue-card"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"
import {
  buildWarrantyIntakeQueue,
  type WarrantyIntakeClaimInput,
  type WarrantyIntakeQueue,
} from "@/lib/reports/warranty-claim-intake-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const NOW = new Date("2026-10-27T05:00:00.000Z") // 12:00 WIB
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function input(over: Partial<WarrantyIntakeClaimInput> = {}): WarrantyIntakeClaimInput {
  return {
    claimId: 1,
    status: "intake",
    reportedAt: day(-5),
    odometerKm: 12000,
    complaint: "Mesin berisik",
    createdByName: "Petugas Uji",
    coverageId: 11,
    coverageStatus: "active",
    coverageExpiresAt: day(30),
    serialNumber: "SN-1",
    itemId: 31,
    itemName: "Part Uji",
    itemSku: "SKU-1",
    customerVehicleId: 41,
    plateNumber: "B 1234 CD",
    vehicleName: "Kendaraan Uji",
    customerId: 21,
    customerName: "Pelanggan Uji",
    ...over,
  }
}

describe("WarrantyIntakeQueueCard 076-F AC-WIQ-F1..F3", () => {
  let root: Root | undefined
  afterEach(() => {
    if (root) unmountCard(root)
    root = undefined
    clearRenderedCards()
  })

  it("judul/kolom/notice verbatim server + rekap dari summary payload", () => {
    const queue = buildWarrantyIntakeQueue(
      [input({}), input({ claimId: 2, reportedAt: day(-1) })],
      { now: NOW },
    )
    const rendered = renderCard(<WarrantyIntakeQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    expect(
      rendered.container.querySelector('[aria-label="Antrean Klaim Garansi Intake"]'),
    ).not.toBeNull()
    expect(text).toContain(
      "Daftar ini hanya klaim garansi yang masih intake dan belum masuk penilaian eligibility. Klaim tetap wajib dinilai dan diputus manual oleh pejabat; majukan lewat detail klaim.",
    )
    const headers = [...rendered.container.querySelectorAll("th")].map((el) => el.textContent)
    expect(headers).toEqual([
      "Menunggu Penilaian",
      "Pelanggan",
      "Kendaraan",
      "Part Tercakup",
      "Dilaporkan",
      "Dibuat Oleh",
    ])
    expect(text).toContain("1 mengendap · 1 menunggu penilaian · 2 klaim intake")
    expect(text).toContain("Mengendap")
    expect(text).toContain("5 hari")
    expect(text).toContain("Menunggu Penilaian")
    expect(text).toContain("Pelanggan Uji")
    expect(text).toContain("B 1234 CD")
    expect(text).toContain("Kendaraan Uji")
    expect(text).toContain("Part Uji")
    expect(text).toContain("SKU-1")
    expect(text).toContain("SN-1")
    expect(text).toContain("Petugas Uji")
    expect(text).toContain("12.000 km")
  })

  it("passthrough umur/tingkat buatan: tampil persis payload, bukan hitung-ulang tanggal", () => {
    // Fixture sengaja tak konsisten: reportedAt kemarin (hitung-ulang = 1
    // hari / menunggu), payload menyatakan umur 99 + Mengendap. UI wajib
    // menempel payload; hitung-ulang apa pun -> MERAH.
    const queue: WarrantyIntakeQueue = {
      rows: [
        {
          claimId: 7,
          level: "mengendap",
          levelLabel: "Mengendap",
          umurIntakeHari: 99,
          reportedAt: day(-1),
          laporDiLuarMasa: false,
          statusCakupan: "active",
          coverageId: 11,
          coverageExpiresAt: day(30),
          serialNumber: null,
          odometerKm: null,
          complaint: "Keluhan uji",
          createdByName: null,
          itemId: 31,
          itemName: "Part Uji",
          itemSku: "SKU-1",
          customerVehicleId: 41,
          plateNumber: null,
          vehicleName: null,
          customerId: 21,
          customerName: "Pelanggan Uji",
        },
      ],
      summary: { mengendap: 42, menunggu: 3, totalIntake: 45 },
      staleDays: 3,
    }
    const rendered = renderCard(<WarrantyIntakeQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    expect(text).toContain("99 hari")
    expect(text).not.toContain("1 hari")
    expect(text).toContain("42 mengendap · 3 menunggu penilaian · 45 klaim intake")
  })

  it("pembuat/odometer kosong tampil —; penanda cakupan fakta tampil", () => {
    const queue = buildWarrantyIntakeQueue(
      [
        input({
          createdByName: null,
          odometerKm: null,
          coverageStatus: "expired",
          coverageExpiresAt: day(-10),
        }),
      ],
      { now: NOW },
    )
    const rendered = renderCard(<WarrantyIntakeQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    const cells = [...rendered.container.querySelectorAll("td")].map((el) => el.textContent)
    expect(cells[cells.length - 1]).toBe("—")
    expect(text).toContain("Odometer: —")
    expect(text).toContain("Cakupan: Kedaluwarsa · dilaporkan di luar masa")
  })

  it("nol label keputusan/biaya + nol tombol aksi; tautan hanya ke detail klaim", () => {
    const queue = buildWarrantyIntakeQueue([input({})], { now: NOW })
    const rendered = renderCard(<WarrantyIntakeQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    for (const banned of ["Disetujui", "Ditolak", "Berbiaya", "Rp", "Maju", "Putus", "Tautkan"]) {
      expect(text).not.toContain(banned)
    }
    expect(rendered.container.querySelector("button")).toBeNull()
    expect(rendered.container.querySelector("form")).toBeNull()
    const hrefs = [...rendered.container.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    )
    expect(hrefs).toEqual(["/produksi/garansi/1"])
  })

  it("kosong: teks kosong verbatim", () => {
    const queue = buildWarrantyIntakeQueue([], { now: NOW })
    const rendered = renderCard(<WarrantyIntakeQueueCard queue={queue} />)
    root = rendered.root
    expect(rendered.container.textContent ?? "").toContain("Tidak ada klaim garansi intake.")
    expect(rendered.container.querySelector("table")).toBeNull()
  })
})
