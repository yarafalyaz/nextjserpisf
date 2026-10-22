// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

vi.mock("@/actions/whatsapp-log.actions", () => ({
  recordWhatsappLinkOpened: vi.fn(async () => ({ success: true })),
}))

import type { Root } from "react-dom/client"
import { WarrantyExpiryQueueCard } from "../warranty-expiry-queue-card"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"
import {
  buildWarrantyExpiryQueue,
  type WarrantyExpiryCoverageInput,
} from "@/lib/reports/warranty-expiry-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const NOW = new Date("2026-10-21T22:00:00.000Z")
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function input(
  overrides: Partial<WarrantyExpiryCoverageInput> = {},
): WarrantyExpiryCoverageInput {
  return {
    coverageId: 1,
    storedStatus: "active",
    expiresAt: day(10),
    installedAt: day(-350),
    warrantyMonths: 12,
    serialNumber: "SN-1",
    mileageLimitKm: null,
    customerVehicleId: 11,
    plateNumber: "B 1234 CD",
    vehicleName: "Kendaraan Uji",
    vehicleIsActive: true,
    vehicleDeletedAt: null,
    lastOdometerKm: null,
    customerId: 21,
    customerName: "Pelanggan Uji",
    customerPhone: "081234567890",
    itemId: 31,
    itemName: "Item Uji",
    itemSku: "SKU-1",
    workOrderId: 41,
    claimStatuses: [],
    ...overrides,
  }
}

describe("WarrantyExpiryQueueCard F-2026-10-22-094-S", () => {
  let root: Root | undefined
  afterEach(() => {
    if (root) unmountCard(root)
    root = undefined
    clearRenderedCards()
  })

  it("scope claims_page: kata §7 verbatim + telepon + WA tampil, serial kosong = status eksplisit", () => {
    const queue = buildWarrantyExpiryQueue(
      [
        input({}),
        input({
          coverageId: 2,
          serialNumber: null,
          expiresAt: day(-3),
          claimStatuses: ["closed"],
          mileageLimitKm: 10000,
          lastOdometerKm: 12000,
        }),
      ],
      { scope: "claims_page", now: NOW },
    )
    const rendered = renderCard(<WarrantyExpiryQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    expect(rendered.container.querySelector('[aria-label="Garansi Segera Berakhir"]')).not.toBeNull()
    expect(text).toContain("Garansi Segera Berakhir")
    expect(text).toContain(
      "Daftar ini membaca tanggal berakhir cakupan garansi. Status tersimpan tidak diubah oleh daftar ini.",
    )
    expect(text).toContain(
      "Menghubungi pelanggan dicatat sebagai tautan dibuka, bukan pesan terkirim.",
    )
    expect(text).toContain("Segera berakhir")
    expect(text).toContain("Baru berakhir")
    expect(text).toContain("Belum pernah klaim")
    expect(text).toContain("Pernah klaim")
    expect(text).toContain("Batas km menurut odometer terakhir tercatat")
    expect(text).toContain("tanpa serial tercatat")
    expect(text).toContain("0812-3456-7890")
    const wa = [...rendered.container.querySelectorAll("a")].filter((a) =>
      (a.getAttribute("href") ?? "").startsWith("https://wa.me/6281234567890"),
    )
    expect(wa.length).toBeGreaterThan(0)
    expect(wa[0]?.getAttribute("aria-label")).toBe("Kirim WA ke pelanggan")
    // Urutan server ditempel: sisa -3 (baru berakhir) sebelum sisa 10.
    expect(text.indexOf("Baru berakhir")).toBeLessThan(text.indexOf("Segera berakhir"))
  })

  it("scope report: telepon + WA TIDAK tampil walau input bertelepon (Q-WX-1)", () => {
    const queue = buildWarrantyExpiryQueue([input({})], { scope: "report", now: NOW })
    expect(queue.rows[0]?.customerPhone).toBeNull()
    const rendered = renderCard(<WarrantyExpiryQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    expect(text).toContain("Pelanggan Uji")
    expect(text).toContain("B 1234 CD")
    expect(text).not.toContain("0812")
    expect(text).not.toContain("Kontak")
    expect(text).not.toContain("Kirim WA")
    expect(
      [...rendered.container.querySelectorAll("a")].some((a) =>
        (a.getAttribute("href") ?? "").includes("wa.me"),
      ),
    ).toBe(false)
  })

  it("kosong: teks kosong §7 verbatim", () => {
    const queue = buildWarrantyExpiryQueue([], { scope: "report", now: NOW })
    const rendered = renderCard(<WarrantyExpiryQueueCard queue={queue} />)
    root = rendered.root
    expect(rendered.container.textContent ?? "").toContain(
      "Tidak ada garansi yang segera berakhir pada jendela ini.",
    )
  })
})
