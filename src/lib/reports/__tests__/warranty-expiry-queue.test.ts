import { describe, it, expect } from "vitest"
import {
  WARRANTY_EXPIRY_BUCKET_LABELS,
  WARRANTY_EXPIRY_CONTACT_NOTICE_TEXT,
  WARRANTY_EXPIRY_EMPTY_TEXT,
  WARRANTY_EXPIRY_KM_LIMIT_LABEL,
  WARRANTY_EXPIRY_NOTICE_TEXT,
  WARRANTY_EXPIRY_QUEUE_TITLE,
  buildWarrantyExpiryQueue,
  type WarrantyExpiryCoverageInput,
} from "../warranty-expiry-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

// Hari kalender WIB tetap: 2026-10-22 — instan 05:00 WIB.
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
    customerPhone: "0812000000",
    itemId: 31,
    itemName: "Item Uji",
    itemSku: "SKU-1",
    workOrderId: 41,
    claimStatuses: [],
    ...overrides,
  }
}

describe("warranty-expiry-queue (F-2026-10-22-094-S, PUTUSAN Q-WX-1..5)", () => {
  it("kata tampil + notice verbatim spec §7", () => {
    expect(WARRANTY_EXPIRY_QUEUE_TITLE).toBe("Garansi Segera Berakhir")
    expect(WARRANTY_EXPIRY_BUCKET_LABELS).toEqual({
      segera_berakhir: "Segera berakhir",
      baru_berakhir: "Baru berakhir",
      tanpa_batas_jelas: "Tanpa batas jelas",
    })
    expect(WARRANTY_EXPIRY_NOTICE_TEXT).toBe(
      "Daftar ini membaca tanggal berakhir cakupan garansi. Status tersimpan tidak diubah oleh daftar ini.",
    )
    expect(WARRANTY_EXPIRY_CONTACT_NOTICE_TEXT).toBe(
      "Menghubungi pelanggan dicatat sebagai tautan dibuka, bukan pesan terkirim.",
    )
    expect(WARRANTY_EXPIRY_EMPTY_TEXT).toBe(
      "Tidak ada garansi yang segera berakhir pada jendela ini.",
    )
    expect(WARRANTY_EXPIRY_KM_LIMIT_LABEL).toBe(
      "Batas km menurut odometer terakhir tercatat",
    )
  })

  it("AC-WX-10: hari ini segera berakhir; kemarin baru berakhir (WIB)", () => {
    const queue = buildWarrantyExpiryQueue(
      [
        input({ coverageId: 1, expiresAt: day(0) }),
        input({ coverageId: 2, expiresAt: day(-1) }),
      ],
      { scope: "claims_page", now: NOW },
    )
    expect(queue.rows.find((r) => r.coverageId === 1)?.ember).toBe("segera_berakhir")
    expect(queue.rows.find((r) => r.coverageId === 1)?.sisaHari).toBe(0)
    expect(queue.rows.find((r) => r.coverageId === 2)?.ember).toBe("baru_berakhir")
    expect(queue.rows.find((r) => r.coverageId === 2)?.sisaHari).toBe(-1)
  })

  it("AC-WX-3: lewat expiresAt tampil baru berakhir walau tersimpan active", () => {
    const queue = buildWarrantyExpiryQueue(
      [
        input({ coverageId: 1, storedStatus: "active", expiresAt: day(-5) }),
        input({ coverageId: 2, storedStatus: "expired", expiresAt: day(-5) }),
      ],
      { scope: "claims_page", now: NOW },
    )
    expect(queue.rows.map((r) => r.ember)).toEqual(["baru_berakhir", "baru_berakhir"])
    expect(queue.rows.map((r) => r.storedStatus)).toEqual(["active", "expired"])
  })

  it("AC-WX-1: revoked keluar; kendaraan nonaktif keluar baris tapi terhitung", () => {
    const queue = buildWarrantyExpiryQueue(
      [
        input({ coverageId: 1, storedStatus: "revoked", expiresAt: day(1) }),
        input({ coverageId: 2, vehicleIsActive: false, expiresAt: day(1) }),
        input({ coverageId: 3, vehicleDeletedAt: day(-1), expiresAt: day(1) }),
        input({ coverageId: 4, expiresAt: day(1) }),
      ],
      { scope: "claims_page", now: NOW },
    )
    expect(queue.rows.map((r) => r.coverageId)).toEqual([4])
    expect(queue.summary.kendaraanNonaktif).toBe(2)
    expect(queue.summary.totalCoverageDinilai).toBe(1)
  })

  it("Q-WX-2: jendela default 30/30; di luar jendela tidak tampil, terhitung", () => {
    const queue = buildWarrantyExpiryQueue(
      [
        input({ coverageId: 1, expiresAt: day(30) }),
        input({ coverageId: 2, expiresAt: day(31) }),
        input({ coverageId: 3, expiresAt: day(-30) }),
        input({ coverageId: 4, expiresAt: day(-31) }),
      ],
      { scope: "claims_page", now: NOW },
    )
    expect(queue.rows.map((r) => r.coverageId)).toEqual([3, 1])
    expect(queue.summary.diLuarJendela).toBe(2)
    expect(queue.windowAheadDays).toBe(30)
    expect(queue.windowPastDays).toBe(30)
  })

  it("Q-WX-2: pilihan tetap 7/30/90 terpisah; nilai liar ditolak", () => {
    const inputs = [input({ coverageId: 1, expiresAt: day(10) })]
    expect(
      buildWarrantyExpiryQueue(inputs, {
        scope: "claims_page",
        now: NOW,
        windowAheadDays: 7,
      }).rows,
    ).toHaveLength(0)
    expect(
      buildWarrantyExpiryQueue(inputs, {
        scope: "claims_page",
        now: NOW,
        windowAheadDays: 90,
      }).rows,
    ).toHaveLength(1)
    expect(() =>
      buildWarrantyExpiryQueue(inputs, {
        scope: "claims_page",
        now: NOW,
        windowAheadDays: 14,
      }),
    ).toThrow(/7\/30\/90/)
    expect(() =>
      buildWarrantyExpiryQueue(inputs, {
        scope: "claims_page",
        now: NOW,
        windowPastDays: 45,
      }),
    ).toThrow(/7\/30\/90/)
  })

  it("AC-WX-5: satu coverage banyak klaim tetap satu baris; penanda tepat", () => {
    const queue = buildWarrantyExpiryQueue(
      [
        input({ coverageId: 1, claimStatuses: ["intake", "closed", "rejected"] }),
        input({ coverageId: 2, claimStatuses: ["closed", "rejected"] }),
        input({ coverageId: 3, claimStatuses: [] }),
      ],
      { scope: "claims_page", now: NOW },
    )
    expect(queue.rows).toHaveLength(3)
    const byId = new Map(queue.rows.map((r) => [r.coverageId, r]))
    expect(byId.get(1)?.penandaKlaim).toBe("ada_klaim_terbuka")
    expect(byId.get(1)?.penandaKlaimLabel).toBe("Ada klaim terbuka")
    expect(byId.get(1)?.openClaimCount).toBe(1)
    expect(byId.get(2)?.penandaKlaim).toBe("pernah_klaim")
    expect(byId.get(3)?.penandaKlaim).toBe("belum_pernah_klaim")
    expect(byId.get(3)?.claimCount).toBe(0)
  })

  it("AC-WX-4: penanda km hanya dari odometer terakhir tercatat >= batas", () => {
    const queue = buildWarrantyExpiryQueue(
      [
        input({ coverageId: 1, mileageLimitKm: 10000, lastOdometerKm: 10000 }),
        input({ coverageId: 2, mileageLimitKm: 10000, lastOdometerKm: 9999 }),
        input({ coverageId: 3, mileageLimitKm: 10000, lastOdometerKm: null }),
        input({ coverageId: 4, mileageLimitKm: null, lastOdometerKm: 99999 }),
      ],
      { scope: "claims_page", now: NOW },
    )
    const byId = new Map(queue.rows.map((r) => [r.coverageId, r]))
    expect(byId.get(1)?.batasKmTercapai).toBe(true)
    expect(byId.get(1)?.batasKmLabel).toBe("Batas km menurut odometer terakhir tercatat")
    expect(byId.get(2)?.batasKmTercapai).toBe(false)
    expect(byId.get(3)?.batasKmTercapai).toBe(false)
    expect(byId.get(4)?.batasKmLabel).toBeNull()
  })

  it("tanpa batas jelas selalu terhitung walau 0; serial kosong berlabel jujur", () => {
    const queue = buildWarrantyExpiryQueue(
      [
        input({ coverageId: 1, expiresAt: null, serialNumber: null }),
        input({ coverageId: 2, expiresAt: new Date(Number.NaN), serialNumber: "" }),
      ],
      { scope: "claims_page", now: NOW },
    )
    expect(queue.rows.map((r) => r.ember)).toEqual([
      "tanpa_batas_jelas",
      "tanpa_batas_jelas",
    ])
    expect(queue.rows.map((r) => r.sisaHari)).toEqual([null, null])
    expect(queue.rows.map((r) => r.serialLabel)).toEqual([
      "tanpa serial tercatat",
      "tanpa serial tercatat",
    ])
    expect(queue.summary.tanpaBatasJelas).toBe(2)

    const empty = buildWarrantyExpiryQueue([], { scope: "claims_page", now: NOW })
    expect(empty.rows).toEqual([])
    expect(empty.summary.tanpaBatasJelas).toBe(0)
  })

  it("AC-WX-6/Q-WX-3: urutan sisa hari naik, seri expiresAt lalu id naik", () => {
    const queue = buildWarrantyExpiryQueue(
      [
        input({ coverageId: 9, expiresAt: day(2) }),
        input({ coverageId: 3, expiresAt: day(-4) }),
        input({ coverageId: 7, expiresAt: day(2) }),
        input({ coverageId: 5, expiresAt: day(0) }),
        input({ coverageId: 8, expiresAt: null }),
      ],
      { scope: "claims_page", now: NOW },
    )
    expect(queue.rows.map((r) => r.coverageId)).toEqual([3, 5, 7, 9, 8])
  })

  it("AC-WX-7/Q-WX-1: scope report menutup telepon; claims_page membuka; scope liar fail-closed", () => {
    const inputs = [input({ coverageId: 1 })]
    expect(
      buildWarrantyExpiryQueue(inputs, { scope: "claims_page", now: NOW }).rows[0]
        ?.customerPhone,
    ).toBe("0812000000")
    expect(
      buildWarrantyExpiryQueue(inputs, { scope: "report", now: NOW }).rows[0]
        ?.customerPhone,
    ).toBeNull()
    expect(() =>
      buildWarrantyExpiryQueue(inputs, {
        scope: "ekspor" as never,
        now: NOW,
      }),
    ).toThrow(/tidak dikenal/)
  })
})
