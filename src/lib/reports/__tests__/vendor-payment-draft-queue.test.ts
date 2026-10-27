import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  VENDOR_PAYMENT_DRAFT_COLUMN_LABELS,
  VENDOR_PAYMENT_DRAFT_LEVEL_LABELS,
  VENDOR_PAYMENT_DRAFT_NOTICE_TEXT,
  VENDOR_PAYMENT_DRAFT_STALE_DAYS,
  VENDOR_PAYMENT_DRAFT_TOTAL_LABEL,
  buildVendorPaymentDraftQueue,
  deriveVendorPaymentDateLampau,
  deriveVendorPaymentDraftAge,
  type VendorPaymentDraftInput,
} from "../vendor-payment-draft-queue"

const mocks = vi.hoisted(() => ({
  vendorPaymentFindMany: vi.fn(),
  userFindMany: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => {
  const findManyDelegate = (fn: typeof mocks.userFindMany) => ({
    findMany: (...a: unknown[]) => fn(...a),
  })
  return {
    prisma: {
      vendorPayment: findManyDelegate(mocks.vendorPaymentFindMany),
      user: findManyDelegate(mocks.userFindMany),
    },
  }
})

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

import { getVendorPaymentDraftQueue } from "../vendor-payment-draft-queue-data"
import {
  VENDOR_PAYMENT_DRAFT_TEST_NOW as NOW,
  VENDOR_PAYMENT_DRAFT_TEST_TODAY as TODAY,
  VENDOR_PAYMENT_LOADER_SELECT_KEYS,
  VENDOR_PAYMENT_QUEUE_KEYS,
  VENDOR_PAYMENT_ROW_KEYS,
  VENDOR_PAYMENT_VENDOR_COUNT_KEYS,
  expectKeysPersis,
  vendorPaymentDraftTestDay as day,
} from "./vendor-payment-draft-queue-test-fixtures"

function input(overrides: Partial<VendorPaymentDraftInput> = {}): VendorPaymentDraftInput {
  return {
    vendorPaymentId: 1,
    slug: "vp-1",
    documentNo: "VP/2026/001",
    status: "draft",
    deletedAt: null,
    vendorId: 10,
    vendorName: "Vendor Uji",
    amount: 1500000,
    paymentDate: day(2),
    vendorBillId: 30,
    vendorBillDocumentNo: "VB/2026/001",
    createdByName: "Pembuat Uji",
    createdAt: day(-2),
    ...overrides,
  }
}

describe("vendor-payment-draft-queue (F-2026-10-26-072-S tahap 1)", () => {
  it("konstanta ambang + kata verbatim putusan Q-VPQ-1/2", () => {
    expect(VENDOR_PAYMENT_DRAFT_STALE_DAYS).toBe(3)
    expect(VENDOR_PAYMENT_DRAFT_LEVEL_LABELS).toEqual({
      mengendap: "Mengendap",
      menunggu: "Menunggu Konfirmasi",
    })
    expect(VENDOR_PAYMENT_DRAFT_COLUMN_LABELS).toEqual({
      documentNo: "No. Dokumen",
      vendor: "Pemasok",
      amount: "Nilai Draft",
      paymentDate: "Tanggal Bayar",
      vendorBill: "Tagihan Tujuan",
      age: "Menunggu",
      createdBy: "Dibuat Oleh",
    })
    expect(VENDOR_PAYMENT_DRAFT_TOTAL_LABEL).toBe("nilai draft belum dibayar")
    expect(VENDOR_PAYMENT_DRAFT_NOTICE_TEXT).toBe(
      "Daftar ini hanya pembayaran vendor yang masih draft dan belum dikonfirmasi. Pembayaran draft belum mengeluarkan kas dan belum mengurangi tagihan vendor; konfirmasi, ubah, atau hapus lewat detail pembayaran.",
    )
  })

  it("AC-VPQ-B1: completed/terhapus lunak/status asing tidak masuk populasi", () => {
    const queue = buildVendorPaymentDraftQueue(
      [
        input({ vendorPaymentId: 1, status: "completed", createdAt: day(-30) }),
        input({ vendorPaymentId: 2, deletedAt: day(-1), createdAt: day(-30) }),
        input({ vendorPaymentId: 3, status: "asing-warisan", createdAt: day(-30) }),
        input({ vendorPaymentId: 4, createdAt: day(-30) }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.vendorPaymentId)).toEqual([4])
    expect(queue.levelCounts).toEqual({ mengendap: 1, menunggu: 0 })
    expect(queue.totalDocuments).toBe(1)
    expect(queue.totalAmount).toBe(1500000)
  })

  it("AC-VPQ-B2: batas umur — hari sama 0, tepat 3 mengendap, 2 menunggu", () => {
    expect(deriveVendorPaymentDraftAge(day(0), TODAY)).toEqual({
      umurDraftHari: 0,
      umurDariMasaDepan: false,
    })
    const queue = buildVendorPaymentDraftQueue(
      [
        input({ vendorPaymentId: 1, createdAt: day(-3) }),
        input({ vendorPaymentId: 2, createdAt: day(-2) }),
      ],
      NOW,
    )
    expect(queue.rows.find((r) => r.vendorPaymentId === 1)?.tingkat).toBe("mengendap")
    expect(queue.rows.find((r) => r.vendorPaymentId === 1)?.tingkatLabel).toBe("Mengendap")
    expect(queue.rows.find((r) => r.vendorPaymentId === 2)?.tingkat).toBe("menunggu")
    expect(queue.rows.find((r) => r.vendorPaymentId === 2)?.tingkatLabel).toBe(
      "Menunggu Konfirmasi",
    )
  })

  it("EC-VPQ-4: createdAt masa depan umur 0 tertanda, bukan negatif", () => {
    expect(deriveVendorPaymentDraftAge(day(3), TODAY)).toEqual({
      umurDraftHari: 0,
      umurDariMasaDepan: true,
    })
  })

  it("AC-VPQ-B3: paymentDate hari sama tidak lampau; lampau tertanda tanpa mengubah tingkat", () => {
    expect(deriveVendorPaymentDateLampau(day(0), TODAY)).toBe(false)
    expect(deriveVendorPaymentDateLampau(day(-1), TODAY)).toBe(true)
    const queue = buildVendorPaymentDraftQueue(
      [input({ vendorPaymentId: 1, createdAt: day(-1), paymentDate: day(-5) })],
      NOW,
    )
    expect(queue.rows[0].paymentDateLampau).toBe(true)
    expect(queue.rows[0].tingkat).toBe("menunggu")
  })

  it("urutan: mengendap dulu, lalu umur tertua; seri documentNo asc", () => {
    const queue = buildVendorPaymentDraftQueue(
      [
        input({ vendorPaymentId: 1, documentNo: "VP/B", createdAt: day(-1) }),
        input({ vendorPaymentId: 2, documentNo: "VP/C", createdAt: day(-10) }),
        input({ vendorPaymentId: 3, documentNo: "VP/A", createdAt: day(-20) }),
        input({ vendorPaymentId: 4, documentNo: "VP/D", createdAt: day(-10) }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.vendorPaymentId)).toEqual([3, 2, 4, 1])
  })

  it("AC-VPQ-B4: Sigma amount verbatim per vendor + grand; amount 0 tetap; label selalu terisi", () => {
    const queue = buildVendorPaymentDraftQueue(
      [
        input({ vendorPaymentId: 1, amount: 1500000, createdAt: day(-9) }),
        input({
          vendorPaymentId: 2,
          amount: 0,
          vendorId: 11,
          vendorName: "Vendor Lain",
          createdAt: day(-1),
        }),
        input({ vendorPaymentId: 3, amount: 250000, createdAt: day(-9) }),
      ],
      NOW,
    )
    expect(queue.rows).toHaveLength(3)
    expect(queue.levelCounts).toEqual({ mengendap: 2, menunggu: 1 })
    expect(queue.totalDocuments).toBe(3)
    expect(queue.totalAmount).toBe(1750000)
    expect(queue.totalLabel).toBe("nilai draft belum dibayar")
    expect(queue.vendorCounts).toEqual([
      {
        vendorId: 11,
        vendorName: "Vendor Lain",
        levelCounts: { mengendap: 0, menunggu: 1 },
        total: 1,
        totalAmount: 0,
      },
      {
        vendorId: 10,
        vendorName: "Vendor Uji",
        levelCounts: { mengendap: 2, menunggu: 0 },
        total: 2,
        totalAmount: 1750000,
      },
    ])
    for (const row of queue.rows) {
      expect(Object.keys(row)).not.toContain("adminFee")
    }
  })

  it("EC-VPQ-1/9: tagihan tujuan/pembuat null tampil apa adanya, tetap terhitung", () => {
    const queue = buildVendorPaymentDraftQueue(
      [input({ vendorBillId: null, vendorBillDocumentNo: null, createdByName: null })],
      NOW,
    )
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].vendorBillDocumentNo).toBeNull()
    expect(queue.rows[0].createdByName).toBeNull()
  })

  it("Σ amount eksak bersen — 0.10+0.20+9999999.99 bukan float (vonis Accountant)", () => {
    const queue = buildVendorPaymentDraftQueue(
      [
        input({ vendorPaymentId: 1, amount: 0.1 }),
        input({ vendorPaymentId: 2, amount: 0.2 }),
        input({ vendorPaymentId: 3, amount: 9999999.99 }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.amount)).toEqual([0.1, 0.2, 9999999.99])
    expect(queue.totalAmount).toBe(10000000.29)
    expect(queue.vendorCounts).toHaveLength(1)
    expect(queue.vendorCounts[0].totalAmount).toBe(10000000.29)
    // Penjaga anti-float: penjumlahan polos menghasilkan 0.30000000000000004.
    const senQueue = buildVendorPaymentDraftQueue(
      [input({ vendorPaymentId: 1, amount: 0.1 }), input({ vendorPaymentId: 2, amount: 0.2 })],
      NOW,
    )
    expect(senQueue.totalAmount).toBe(0.3)
    // 10 x 0.1: float polos = 0.9999999999999999; sen integer = 1 eksak.
    const tenQueue = buildVendorPaymentDraftQueue(
      Array.from({ length: 10 }, (_, i) =>
        input({ vendorPaymentId: i + 1, amount: 0.1 }),
      ),
      NOW,
    )
    expect(tenQueue.totalAmount).toBe(1)
    expect(tenQueue.vendorCounts[0].totalAmount).toBe(1)
  })

  it("keys Row persis daftar-putih — field asing WAJIB gagal", () => {
    const queue = buildVendorPaymentDraftQueue([input()], NOW)
    expect(queue.rows).toHaveLength(1)
    expectKeysPersis(queue.rows[0], VENDOR_PAYMENT_ROW_KEYS)
    expect(Object.keys(queue.rows[0])).not.toContain("adminFee")
    expectKeysPersis(queue, VENDOR_PAYMENT_QUEUE_KEYS)
    for (const count of queue.vendorCounts) {
      expectKeysPersis(count, VENDOR_PAYMENT_VENDOR_COUNT_KEYS)
    }
  })
})

describe("getVendorPaymentDraftQueue (loader fail-closed, AC-VPQ-B1/B4/B5)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: "1", roles: ["finance"] })
    mocks.vendorPaymentFindMany.mockResolvedValue([])
    mocks.userFindMany.mockResolvedValue([])
  })

  it("tanpa izin view_vendor_payments loader menolak sebelum query apa pun", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getVendorPaymentDraftQueue({ now: NOW })).rejects.toThrow(
      "Tidak memiliki izin",
    )
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_vendor_payments")
    expect(mocks.vendorPaymentFindMany).not.toHaveBeenCalled()
  })

  it("populasi persis draft+deletedAt null; select daftar-putih tanpa adminFee; pembuat massal 1 query", async () => {
    mocks.vendorPaymentFindMany.mockResolvedValue([
      {
        id: 1,
        slug: "vp-1",
        documentNo: "VP/2026/001",
        status: "draft",
        deletedAt: null,
        vendorId: 10,
        amount: 1500000,
        paymentDate: day(-5),
        vendorBillId: 30,
        createdBy: 99,
        createdAt: day(-10),
        vendor: { name: "Vendor Uji" },
        vendorBill: { documentNo: "VB/2026/001" },
      },
      {
        id: 2,
        slug: null,
        documentNo: "VP/2026/002",
        status: "draft",
        deletedAt: null,
        vendorId: 10,
        amount: 0,
        paymentDate: day(1),
        vendorBillId: null,
        createdBy: 99,
        createdAt: day(-1),
        vendor: { name: "Vendor Uji" },
        vendorBill: null,
      },
    ])
    mocks.userFindMany.mockResolvedValue([{ id: 99, name: "Pembuat Uji" }])

    const queue = await getVendorPaymentDraftQueue({ now: NOW })

    expect(mocks.vendorPaymentFindMany).toHaveBeenCalledTimes(1)
    const arg = mocks.vendorPaymentFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({ status: "draft", deletedAt: null })
    const selectKeys = Object.keys(arg.select)
    expectKeysPersis(arg.select, VENDOR_PAYMENT_LOADER_SELECT_KEYS)
    expect(selectKeys).not.toContain("adminFee")
    expect(arg.select.vendor).toEqual({ select: { name: true } })
    expect(arg.select.vendorBill).toEqual({ select: { documentNo: true } })
    const userArg = mocks.userFindMany.mock.calls[0][0]
    expectKeysPersis(userArg.select, ["id", "name"])
    expect(mocks.userFindMany).toHaveBeenCalledTimes(1)
    expect(userArg.where).toEqual({ id: { in: [99] } })

    expect(queue.totalDocuments).toBe(2)
    expect(queue.totalAmount).toBe(1500000)
    const old = queue.rows.find((r) => r.vendorPaymentId === 1)!
    expect(old.createdByName).toBe("Pembuat Uji")
    expect(old.tingkat).toBe("mengendap")
    expect(old.paymentDateLampau).toBe(true)
    const recent = queue.rows.find((r) => r.vendorPaymentId === 2)!
    expect(recent.vendorBillDocumentNo).toBeNull()
    expect(recent.tingkat).toBe("menunggu")
  })
})
