import { describe, it, expect, vi, beforeEach } from "vitest"

import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

/**
 * Aging klaim supplier terbuka (F-2026-10-24-095-S BR-SUPP-11, lapis aman
 * tanpa migrasi). Yang dijaga: populasi hanya supplierClaimStatus
 * non-terminal bukan none, umur hari kalender WIB sejak supplierClaimAt
 * (bukan reportedAt), ember 0-30/31-60/61-90/>90 + tanpa_tanggal,
 * urutan tertua dulu, dan loader satu query massal status terbuka.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    warrantyClaim: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { getSupplierClaimAging } from "../supplier-claim-aging-data"
import {
  SUPPLIER_CLAIM_AGING_EMPTY_TEXT,
  SUPPLIER_CLAIM_AGING_NOTICE_TEXT,
  SUPPLIER_CLAIM_AGING_TITLE,
  SUPPLIER_CLAIM_OPEN_STATUSES,
  SUPPLIER_CLAIM_STATUS_LABELS,
  buildSupplierClaimAging,
  supplierClaimAgingBucketForDays,
  type SupplierClaimAgingInput,
} from "../supplier-claim-aging"

const NOW = new Date("2026-10-24T05:00:00.000Z") // 12:00 WIB
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function input(over: Partial<SupplierClaimAgingInput> = {}): SupplierClaimAgingInput {
  return {
    claimId: 1,
    claimStatus: "closed",
    supplierClaimStatus: "drafted",
    supplierClaimAt: day(-5),
    supplierClaimRefNo: "REF-1",
    vendorId: 7,
    vendorName: "Vendor Uji",
    purchaseReturnId: null,
    purchaseReturnDocumentNo: null,
    purchaseReturnStatus: null,
    coverageId: 11,
    itemId: 31,
    itemName: "Item Uji",
    itemSku: "SKU-1",
    serialNumber: "SN-1",
    customerId: 21,
    customerName: "Pelanggan Uji",
    customerVehicleId: 41,
    plateNumber: "B 1234 CD",
    vehicleName: "Kendaraan Uji",
    reportedAt: day(-40),
    ...over,
  }
}

describe("supplier-claim-aging (F-2026-10-24-095-S BR-SUPP-11)", () => {
  it("kata tampil + notice verbatim; populasi terbuka persis BR-SUPP-11", () => {
    expect(SUPPLIER_CLAIM_AGING_TITLE).toBe("Aging Klaim Supplier Terbuka")
    expect(SUPPLIER_CLAIM_AGING_NOTICE_TEXT).toBe(
      "Daftar ini membaca status klaim supplier yang masih terbuka; tidak mengubah status klaim supplier atau klaim pelanggan, dan tidak memposting jurnal recovery.",
    )
    expect(SUPPLIER_CLAIM_AGING_EMPTY_TEXT).toBe("Tidak ada klaim supplier terbuka saat ini.")
    expect(SUPPLIER_CLAIM_OPEN_STATUSES).toEqual([
      "drafted",
      "sent",
      "accepted",
      "rejected_supplier",
      "returned",
    ])
    expect(SUPPLIER_CLAIM_STATUS_LABELS).toMatchObject({
      drafted: "Draf klaim supplier",
      sent: "Terkirim ke supplier",
      accepted: "Diterima supplier",
      rejected_supplier: "Ditolak supplier",
      returned: "Part sudah diretur",
    })
  })

  it("populasi: terminal + none + status tak dikenal keluar, tidak terhitung", () => {
    const result = buildSupplierClaimAging(
      [
        input({ claimId: 1, supplierClaimStatus: "drafted" }),
        input({ claimId: 2, supplierClaimStatus: "sent" }),
        input({ claimId: 3, supplierClaimStatus: "accepted" }),
        input({ claimId: 4, supplierClaimStatus: "rejected_supplier" }),
        input({ claimId: 5, supplierClaimStatus: "returned" }),
        input({ claimId: 6, supplierClaimStatus: "closed_recovered" }),
        input({ claimId: 7, supplierClaimStatus: "closed_no_recovery" }),
        input({ claimId: 8, supplierClaimStatus: "none" }),
        input({ claimId: 9, supplierClaimStatus: "status_liar" }),
      ],
      { now: NOW },
    )
    expect(result.rows.map((r) => r.claimId)).toEqual([1, 2, 3, 4, 5])
    expect(result.summary.totalOpen).toBe(5)
    expect(result.summary.byStatus.map((s) => s.claimCount)).toEqual([1, 1, 1, 1, 1])
  })

  it("umur sejak supplierClaimAt, bukan reportedAt; ember + batas tepat", () => {
    // reportedAt 100 hari lalu tetapi tautan supplier baru 5 hari lalu.
    const result = buildSupplierClaimAging(
      [input({ claimId: 1, supplierClaimAt: day(-5), reportedAt: day(-100) })],
      { now: NOW },
    )
    expect(result.rows[0]?.ageDays).toBe(5)
    expect(result.rows[0]?.ageBucket).toBe("d0_30")
    expect(supplierClaimAgingBucketForDays(0)).toBe("d0_30")
    expect(supplierClaimAgingBucketForDays(30)).toBe("d0_30")
    expect(supplierClaimAgingBucketForDays(31)).toBe("d31_60")
    expect(supplierClaimAgingBucketForDays(60)).toBe("d31_60")
    expect(supplierClaimAgingBucketForDays(61)).toBe("d61_90")
    expect(supplierClaimAgingBucketForDays(90)).toBe("d61_90")
    expect(supplierClaimAgingBucketForDays(91)).toBe("over90")
    expect(supplierClaimAgingBucketForDays(null)).toBe("tanpa_tanggal")
  })

  it("supplierClaimAt kosong/rusak = tanpa_tanggal, tetap tampil berlabel jujur", () => {
    const result = buildSupplierClaimAging(
      [
        input({ claimId: 1, supplierClaimAt: null }),
        input({ claimId: 2, supplierClaimAt: new Date(Number.NaN) }),
        input({ claimId: 3, supplierClaimAt: day(-2) }),
      ],
      { now: NOW },
    )
    expect(result.rows.map((r) => r.claimId)).toEqual([3, 1, 2])
    expect(result.rows[1]?.ageDays).toBeNull()
    expect(result.rows[1]?.ageBucket).toBe("tanpa_tanggal")
    expect(result.rows[1]?.ageDateLabel).toBe("Tanpa tanggal klaim supplier")
    expect(result.summary.buckets.find((b) => b.id === "tanpa_tanggal")?.claimCount).toBe(2)
  })

  it("umur masa depan dijepit 0; urutan tertua dulu, seri claimId naik", () => {
    const result = buildSupplierClaimAging(
      [
        input({ claimId: 9, supplierClaimAt: day(-10) }),
        input({ claimId: 3, supplierClaimAt: day(-45) }),
        input({ claimId: 7, supplierClaimAt: day(-45) }),
        input({ claimId: 5, supplierClaimAt: day(2) }),
      ],
      { now: NOW },
    )
    expect(result.rows.map((r) => r.claimId)).toEqual([3, 7, 9, 5])
    expect(result.rows[3]?.ageDays).toBe(0)
    expect(result.summary.oldestClaimId).toBe(3)
    expect(result.summary.oldestAgeDays).toBe(45)
  })

  it("label status verbatim panel live; serial kosong jadi null", () => {
    const result = buildSupplierClaimAging(
      [input({ claimId: 1, supplierClaimStatus: "sent", serialNumber: "" })],
      { now: NOW },
    )
    expect(result.rows[0]?.supplierClaimStatusLabel).toBe("Terkirim ke supplier")
    expect(result.rows[0]?.serialNumber).toBeNull()
    expect(buildSupplierClaimAging([], { now: NOW }).summary.totalOpen).toBe(0)
    expect(buildSupplierClaimAging([], { now: NOW }).summary.oldestClaimId).toBeNull()
  })
})

describe("getSupplierClaimAging (loader)", () => {
  beforeEach(() => {
    mocks.prismaMock.warrantyClaim.findMany.mockReset()
  })

  it("satu query massal status terbuka; memetakan relasi; tanpa telepon", async () => {
    mocks.prismaMock.warrantyClaim.findMany.mockResolvedValue([
      {
        id: 3,
        status: "closed",
        reportedAt: day(-40),
        supplierClaimStatus: "sent",
        supplierClaimVendorId: 7,
        supplierClaimRefNo: "RESI-1",
        supplierClaimAt: day(-12),
        purchaseReturnId: 9,
        supplierClaimVendor: { id: 7, name: "Vendor Uji" },
        purchaseReturn: { id: 9, documentNo: "PR-9", status: "returned" },
        coverage: {
          id: 11,
          serialNumber: "SN-1",
          itemId: 31,
          item: { name: "Item Uji", sku: "SKU-1" },
        },
        customerVehicle: {
          id: 41,
          plateNumber: "B 1234 CD",
          customer: { id: 21, name: "Pelanggan Uji" },
          vehicle: { name: "Kendaraan Uji" },
        },
      },
    ])

    const result = await getSupplierClaimAging(NOW)

    expect(mocks.prismaMock.warrantyClaim.findMany).toHaveBeenCalledTimes(1)
    const args = mocks.prismaMock.warrantyClaim.findMany.mock.calls[0]?.[0]
    expect(args.where).toEqual({
      supplierClaimStatus: { in: ["drafted", "sent", "accepted", "rejected_supplier", "returned"] },
    })
    // Telepon tidak pernah dipilih (daftar untuk tindak lanjut vendor).
    expect(JSON.stringify(args.select)).not.toContain("phone")
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      claimId: 3,
      supplierClaimStatus: "sent",
      ageDays: 12,
      ageBucket: "d0_30",
      vendorName: "Vendor Uji",
      purchaseReturnDocumentNo: "PR-9",
      purchaseReturnStatus: "returned",
      itemName: "Item Uji",
      plateNumber: "B 1234 CD",
    })
    expect(result.summary.totalOpen).toBe(1)
  })

  it("vendor terlepas (SetNull) tetap tampil tanpa nama vendor", async () => {
    mocks.prismaMock.warrantyClaim.findMany.mockResolvedValue([
      {
        id: 4,
        status: "approved",
        reportedAt: day(-3),
        supplierClaimStatus: "drafted",
        supplierClaimVendorId: null,
        supplierClaimRefNo: null,
        supplierClaimAt: day(-1),
        purchaseReturnId: null,
        supplierClaimVendor: null,
        purchaseReturn: null,
        coverage: {
          id: 12,
          serialNumber: null,
          itemId: 32,
          item: { name: "Item Lain", sku: "SKU-2" },
        },
        customerVehicle: {
          id: 42,
          plateNumber: null,
          customer: { id: 22, name: "Pelanggan Lain" },
          vehicle: { name: "Kendaraan Lain" },
        },
      },
    ])

    const result = await getSupplierClaimAging(NOW)
    expect(result.rows[0]).toMatchObject({ claimId: 4, vendorId: null, vendorName: null })
  })
})
