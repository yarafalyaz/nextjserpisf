import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  PURCHASE_ORDER_DRAFT_COLUMN_LABELS,
  PURCHASE_ORDER_DRAFT_DIRECT_TEXT,
  PURCHASE_ORDER_DRAFT_FROM_REQUEST_TEXT,
  PURCHASE_ORDER_DRAFT_FROM_WORK_ORDER_TEXT,
  PURCHASE_ORDER_DRAFT_LEVEL_LABELS,
  PURCHASE_ORDER_DRAFT_NOTICE_TEXT,
  PURCHASE_ORDER_DRAFT_NO_EXPECTED_DATE_TEXT,
  PURCHASE_ORDER_DRAFT_QUEUE_TITLE_TEXT,
  PURCHASE_ORDER_DRAFT_STALE_DAYS,
  PURCHASE_ORDER_DRAFT_TOTAL_LABEL_TEXT,
  buildPurchaseOrderDraftQueue,
  derivePurchaseOrderDraftAge,
  derivePurchaseOrderDraftSource,
  type PurchaseOrderDraftInput,
} from "../purchase-order-draft-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const mocks = vi.hoisted(() => ({
  purchaseOrderFindMany: vi.fn(),
  userFindMany: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    purchaseOrder: {
      findMany: (...a: unknown[]) => mocks.purchaseOrderFindMany(...a),
    },
    user: {
      findMany: (...a: unknown[]) => mocks.userFindMany(...a),
    },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

import { getPurchaseOrderDraftQueue } from "../purchase-order-draft-queue-data"

// Kunci select loader persis (daftar-putih BR-POQ-08: tanpa phone/email/address
// vendor) — perbandingan sebagai himpunan.
const LOADER_SELECT_KEYS = [
  "createdAt",
  "createdBy",
  "date",
  "deletedAt",
  "documentNo",
  "expectedDate",
  "grandTotal",
  "id",
  "isService",
  "purchaseRequest",
  "purchaseRequestId",
  "slug",
  "status",
  "vendor",
  "vendorId",
  "workOrder",
  "workOrderId",
] as const

// Hari kalender WIB tetap: 2026-10-26 — instan 05:00 WIB.
const NOW = new Date("2026-10-25T22:00:00.000Z")
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function input(overrides: Partial<PurchaseOrderDraftInput> = {}): PurchaseOrderDraftInput {
  return {
    purchaseOrderId: 1,
    slug: "po-1",
    documentNo: "PO/2026/001",
    status: "draft",
    deletedAt: null,
    vendorId: 10,
    vendorName: "Vendor Uji",
    purchaseRequestId: null,
    purchaseRequestDocumentNo: null,
    workOrderId: null,
    workOrderDocumentNo: null,
    isService: false,
    date: day(-4),
    expectedDate: null,
    createdByName: "Pembuat Uji",
    createdAt: day(-2),
    grandTotal: 1500,
    ...overrides,
  }
}

describe("purchase-order-draft-queue (F-2026-10-26-060-S tahap 1, lapis aman)", () => {
  it("konstanta ambang preseden keluarga + kata provisional Q-POQ-2/BR-POQ-03", () => {
    expect(PURCHASE_ORDER_DRAFT_STALE_DAYS).toBe(3)
    expect(PURCHASE_ORDER_DRAFT_LEVEL_LABELS).toEqual({
      mengendap: "Mengendap",
      menunggu: "Menunggu Persetujuan",
    })
    expect(PURCHASE_ORDER_DRAFT_QUEUE_TITLE_TEXT).toBe("Pesanan Pembelian Draft Mengendap")
    expect(PURCHASE_ORDER_DRAFT_COLUMN_LABELS).toEqual({
      documentNo: "No. Dokumen",
      vendor: "Vendor",
      source: "Sumber",
      value: "Nilai Draft",
      expectedDate: "Rencana Terima",
      age: "Menunggu Persetujuan",
      createdBy: "Dibuat Oleh",
    })
    expect(PURCHASE_ORDER_DRAFT_NO_EXPECTED_DATE_TEXT).toBe("Rencana terima belum diisi")
    expect(PURCHASE_ORDER_DRAFT_TOTAL_LABEL_TEXT).toBe("nilai draft belum disetujui")
    expect(PURCHASE_ORDER_DRAFT_NOTICE_TEXT).toBe(
      "Daftar ini hanya pesanan pembelian yang masih draft dan belum disetujui. Nilai draft belum disetujui, belum menjadi utang dan belum menjadi komitmen bayar; setujui, ubah, atau batalkan lewat detail pesanan.",
    )
  })

  it("AC-POQ-B1: hanya draft + deletedAt null lolos persis", () => {
    const queue = buildPurchaseOrderDraftQueue(
      [
        input({ purchaseOrderId: 1, status: "approved", createdAt: day(-30) }),
        input({ purchaseOrderId: 2, status: "ordered", createdAt: day(-30) }),
        input({ purchaseOrderId: 3, status: "partial_received", createdAt: day(-30) }),
        input({ purchaseOrderId: 4, status: "received", createdAt: day(-30) }),
        input({ purchaseOrderId: 5, status: "cancelled", createdAt: day(-30) }),
        input({ purchaseOrderId: 6, status: "asing-warisan", createdAt: day(-30) }),
        input({ purchaseOrderId: 7, deletedAt: day(-1), createdAt: day(-30) }),
        input({ purchaseOrderId: 8, createdAt: day(-30) }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.purchaseOrderId)).toEqual([8])
    expect(queue.levelCounts).toEqual({ mengendap: 1, menunggu: 0 })
    expect(queue.totalDocuments).toBe(1)
  })

  it("AC-POQ-B2: batas umur — hari sama 0, tepat 3 mengendap, 2 menunggu", () => {
    expect(derivePurchaseOrderDraftAge(day(0), TODAY)).toEqual({
      umurDraftHari: 0,
      umurDariMasaDepan: false,
    })
    const queue = buildPurchaseOrderDraftQueue(
      [
        input({ purchaseOrderId: 1, createdAt: day(-3) }),
        input({ purchaseOrderId: 2, createdAt: day(-2) }),
      ],
      NOW,
    )
    expect(queue.rows.find((r) => r.purchaseOrderId === 1)?.tingkat).toBe("mengendap")
    expect(queue.rows.find((r) => r.purchaseOrderId === 1)?.tingkatLabel).toBe("Mengendap")
    expect(queue.rows.find((r) => r.purchaseOrderId === 2)?.tingkat).toBe("menunggu")
    expect(queue.rows.find((r) => r.purchaseOrderId === 2)?.tingkatLabel).toBe(
      "Menunggu Persetujuan",
    )
  })

  it("BR-POQ-10: createdAt masa depan umur 0 tertanda, bukan negatif", () => {
    expect(derivePurchaseOrderDraftAge(day(3), TODAY)).toEqual({
      umurDraftHari: 0,
      umurDariMasaDepan: true,
    })
    const queue = buildPurchaseOrderDraftQueue([input({ createdAt: day(2) })], NOW)
    expect(queue.rows[0].umurDraftHari).toBe(0)
    expect(queue.rows[0].umurDariMasaDepan).toBe(true)
    expect(queue.rows[0].tingkat).toBe("menunggu")
  })

  it("AC-POQ-B4: sumber satu label — PR menang atas WO, jasa label WO, langsung tanpa keduanya", () => {
    expect(
      derivePurchaseOrderDraftSource({
        purchaseRequestId: 5,
        purchaseRequestDocumentNo: "PR/2026/001",
        workOrderId: 7,
        workOrderDocumentNo: "WO/2026/001",
        isService: true,
      }),
    ).toBe(`${PURCHASE_ORDER_DRAFT_FROM_REQUEST_TEXT} PR/2026/001`)
    expect(
      derivePurchaseOrderDraftSource({
        purchaseRequestId: null,
        purchaseRequestDocumentNo: null,
        workOrderId: 7,
        workOrderDocumentNo: "WO/2026/001",
        isService: true,
      }),
    ).toBe(`${PURCHASE_ORDER_DRAFT_FROM_WORK_ORDER_TEXT} WO/2026/001`)
    expect(
      derivePurchaseOrderDraftSource({
        purchaseRequestId: null,
        purchaseRequestDocumentNo: null,
        workOrderId: null,
        workOrderDocumentNo: null,
        isService: true,
      }),
    ).toBe(PURCHASE_ORDER_DRAFT_FROM_WORK_ORDER_TEXT)
    expect(
      derivePurchaseOrderDraftSource({
        purchaseRequestId: null,
        purchaseRequestDocumentNo: null,
        workOrderId: null,
        workOrderDocumentNo: null,
        isService: false,
      }),
    ).toBe(PURCHASE_ORDER_DRAFT_DIRECT_TEXT)
    const queue = buildPurchaseOrderDraftQueue(
      [
        input({
          purchaseOrderId: 1,
          purchaseRequestId: 5,
          purchaseRequestDocumentNo: "PR/2026/001",
          workOrderId: 7,
          workOrderDocumentNo: "WO/2026/001",
        }),
        input({ purchaseOrderId: 2, isService: true, workOrderId: 7, workOrderDocumentNo: "WO/2026/001" }),
        input({ purchaseOrderId: 3 }),
      ],
      NOW,
    )
    const byId = new Map(queue.rows.map((r) => [r.purchaseOrderId, r.sumberLabel]))
    expect(byId.get(1)).toBe("Permintaan Pembelian PR/2026/001")
    expect(byId.get(2)).toBe("Perintah Kerja WO/2026/001")
    expect(byId.get(3)).toBe("Langsung")
  })

  it("BR-POQ-04/EC-POQ-4: expectedDate lampau/kosong hanya penanda, tanpa kata terlambat", () => {
    const queue = buildPurchaseOrderDraftQueue(
      [
        input({ purchaseOrderId: 1, expectedDate: day(-10), createdAt: day(-1) }),
        input({ purchaseOrderId: 2, expectedDate: null, createdAt: day(-1) }),
      ],
      NOW,
    )
    const lampau = queue.rows.find((r) => r.purchaseOrderId === 1)!
    expect(lampau.punyaRencanaTerima).toBe(true)
    expect(lampau.tingkat).toBe("menunggu")
    expect(JSON.stringify(lampau).toLowerCase()).not.toContain("terlambat")
    expect(JSON.stringify(lampau).toLowerCase()).not.toContain("jatuh tempo")
    const kosong = queue.rows.find((r) => r.purchaseOrderId === 2)!
    expect(kosong.punyaRencanaTerima).toBe(false)
    expect(PURCHASE_ORDER_DRAFT_NO_EXPECTED_DATE_TEXT).not.toContain("Terlambat")
  })

  it("urutan BR-POQ-06: mengendap dulu, lalu umur tertua; seri documentNo asc (EC-POQ-5)", () => {
    const queue = buildPurchaseOrderDraftQueue(
      [
        input({ purchaseOrderId: 1, documentNo: "PO/B", createdAt: day(-1) }),
        input({ purchaseOrderId: 2, documentNo: "PO/C", createdAt: day(-10) }),
        input({ purchaseOrderId: 3, documentNo: "PO/A", createdAt: day(-20) }),
        input({ purchaseOrderId: 4, documentNo: "PO/D", createdAt: day(-10) }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.purchaseOrderId)).toEqual([3, 2, 4, 1])
  })

  it("AC-POQ-B3/EC-POQ-1/EC-POQ-3: Σ berlabel verbatim; grandTotal 0 tetap tampil; vendor null tetap baris", () => {
    const queue = buildPurchaseOrderDraftQueue(
      [
        input({ purchaseOrderId: 1, grandTotal: 1000.5, createdAt: day(-9) }),
        input({ purchaseOrderId: 2, grandTotal: 0, vendorName: null, createdAt: day(-9) }),
        input({ purchaseOrderId: 3, grandTotal: 250.25, createdAt: day(-1) }),
      ],
      NOW,
    )
    expect(queue.rows).toHaveLength(3)
    expect(queue.totalGrandTotal).toBe(1250.75)
    expect(queue.totalLabel).toBe("nilai draft belum disetujui")
    expect(queue.rows.find((r) => r.purchaseOrderId === 2)?.vendorName).toBeNull()
    expect(queue.levelCounts).toEqual({ mengendap: 2, menunggu: 1 })
    expect(queue.totalDocuments).toBe(3)
  })

  it("EC-POQ-2: PO draft dari PR partial_ordered tetap populasi (status PO yang menilai)", () => {
    const queue = buildPurchaseOrderDraftQueue(
      [
        input({
          purchaseOrderId: 1,
          purchaseRequestId: 9,
          purchaseRequestDocumentNo: "PR/2026/009",
          createdAt: day(-5),
        }),
      ],
      NOW,
    )
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].sumberLabel).toBe("Permintaan Pembelian PR/2026/009")
  })
})

describe("getPurchaseOrderDraftQueue (loader fail-closed, AC-POQ-B5)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "1", roles: ["purchasing"] })
    mocks.purchaseOrderFindMany.mockResolvedValue([])
    mocks.userFindMany.mockResolvedValue([])
  })

  it("tanpa izin view_purchase_orders loader menolak sebelum query apa pun", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getPurchaseOrderDraftQueue({ now: NOW })).rejects.toThrow("Tidak memiliki izin")
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_purchase_orders")
    expect(mocks.purchaseOrderFindMany).not.toHaveBeenCalled()
    expect(mocks.userFindMany).not.toHaveBeenCalled()
  })

  it("where persis draft+deletedAt null; select daftar-putih tanpa kontak vendor; Decimal->Number; pembuat massal 1 query", async () => {
    mocks.purchaseOrderFindMany.mockResolvedValue([
      {
        id: 1,
        slug: "po-1",
        documentNo: "PO/2026/001",
        status: "draft",
        deletedAt: null,
        vendorId: 10,
        purchaseRequestId: 5,
        workOrderId: null,
        isService: false,
        date: day(-12),
        expectedDate: day(-3),
        createdBy: 99,
        createdAt: day(-10),
        grandTotal: 1250.75,
        vendor: { name: "Vendor Uji" },
        purchaseRequest: { documentNo: "PR/2026/001" },
        workOrder: null,
      },
      {
        id: 2,
        slug: null,
        documentNo: "PO/2026/002",
        status: "draft",
        deletedAt: null,
        vendorId: 11,
        purchaseRequestId: null,
        workOrderId: 7,
        isService: true,
        date: day(-2),
        expectedDate: null,
        createdBy: 99,
        createdAt: day(-1),
        grandTotal: 0,
        vendor: null,
        purchaseRequest: null,
        workOrder: { documentNo: "WO/2026/001" },
      },
    ])
    mocks.userFindMany.mockResolvedValue([{ id: 99, name: "Pembuat Uji" }])

    const queue = await getPurchaseOrderDraftQueue({ now: NOW })

    expect(mocks.purchaseOrderFindMany).toHaveBeenCalledTimes(1)
    const arg = mocks.purchaseOrderFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({ status: "draft", deletedAt: null })
    const selectKeys = Object.keys(arg.select)
    expect([...selectKeys].sort()).toEqual([...LOADER_SELECT_KEYS].sort())
    expect(arg.select.vendor).toEqual({ select: { name: true } })
    expect(arg.select.purchaseRequest).toEqual({ select: { documentNo: true } })
    expect(arg.select.workOrder).toEqual({ select: { documentNo: true } })
    expect(JSON.stringify(arg.select)).not.toContain("phone")
    expect(JSON.stringify(arg.select)).not.toContain("email")
    expect(JSON.stringify(arg.select)).not.toContain("address")
    expect(mocks.userFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.userFindMany.mock.calls[0][0].where).toEqual({ id: { in: [99] } })

    expect(queue.totalDocuments).toBe(2)
    expect(queue.totalGrandTotal).toBe(1250.75)
    expect(queue.totalLabel).toBe("nilai draft belum disetujui")
    const tua = queue.rows.find((r) => r.purchaseOrderId === 1)!
    expect(tua.tingkat).toBe("mengendap")
    expect(tua.grandTotal).toBe(1250.75)
    expect(tua.vendorName).toBe("Vendor Uji")
    expect(tua.sumberLabel).toBe("Permintaan Pembelian PR/2026/001")
    expect(tua.createdByName).toBe("Pembuat Uji")
    expect(tua.punyaRencanaTerima).toBe(true)
    const jasa = queue.rows.find((r) => r.purchaseOrderId === 2)!
    expect(jasa.tingkat).toBe("menunggu")
    expect(jasa.vendorName).toBeNull()
    expect(jasa.sumberLabel).toBe("Perintah Kerja WO/2026/001")
  })
})
