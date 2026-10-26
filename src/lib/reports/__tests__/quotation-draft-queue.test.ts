import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  QUOTATION_DRAFT_EXPIRY_WARNING_DAYS,
  QUOTATION_DRAFT_NOTICE_TEXT,
  QUOTATION_DRAFT_STAGE_LABELS,
  buildQuotationDraftQueue,
  countQuotationDraftStages,
  deriveQuotationDraftStage,
  filterQuotationDraftQueue,
  type QuotationDraftInput,
} from "../quotation-draft-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"
import { isQuotationExpired } from "@/lib/utils/quotation-expiry"

const mocks = vi.hoisted(() => ({
  quotationFindMany: vi.fn(),
  employeeFindMany: vi.fn(),
  quotationUpdate: vi.fn(),
  quotationCreate: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    quotation: {
      findMany: (...a: unknown[]) => mocks.quotationFindMany(...a),
      update: (...a: unknown[]) => mocks.quotationUpdate(...a),
      create: (...a: unknown[]) => mocks.quotationCreate(...a),
    },
    employee: {
      findMany: (...a: unknown[]) => mocks.employeeFindMany(...a),
    },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermission(...a),
}))

import { getQuotationDraftQueue } from "../quotation-draft-queue-data"

// Hari kalender WIB tetap: 2026-10-26 — instan 05:00 WIB.
const NOW = new Date("2026-10-25T22:00:00.000Z")
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function input(overrides: Partial<QuotationDraftInput> = {}): QuotationDraftInput {
  return {
    quotationId: 1,
    slug: "quo-1",
    documentNo: "QUO/2026/001",
    status: "draft",
    deletedAt: null,
    customerId: 10,
    customerName: "PT Uji",
    salesEmployeeId: 7,
    salesEmployeeName: "Sales Uji",
    date: day(-5),
    validUntil: day(10),
    createdAt: day(-5),
    grandTotal: 1000,
    ...overrides,
  }
}

describe("buildQuotationDraftQueue (builder murni, F-2026-10-26-055-S)", () => {
  it("konstanta ambang + label + notice verbatim putusan Q-QD-1/2", () => {
    expect(QUOTATION_DRAFT_EXPIRY_WARNING_DAYS).toBe(3)
    expect(QUOTATION_DRAFT_STAGE_LABELS).toEqual({
      LEWAT_BELUM_TERKIRIM: "Lewat Masa Berlaku — Belum Terkirim",
      MENIPIS: "Masa Berlaku Menipis",
      TERBUKA: "Terbuka",
      TANPA_BATAS: "Tanpa Masa Berlaku",
    })
    expect(QUOTATION_DRAFT_NOTICE_TEXT).toBe(
      "Daftar ini hanya penawaran yang masih draft dan belum pernah dikirim. Draf belum menjadi penawaran ke pelanggan; kirim, revisi, atau hapus lewat detail penawaran.",
    )
  })

  it("AC-QD-1: sent/accepted/converted/terhapus tidak pernah masuk walau validUntil lewat", () => {
    const rows = buildQuotationDraftQueue(
      [
        input({ quotationId: 1, status: "sent", validUntil: day(-3) }),
        input({ quotationId: 2, status: "accepted", validUntil: day(-3) }),
        input({ quotationId: 3, status: "converted", validUntil: day(-3) }),
        input({ quotationId: 4, status: "rejected", validUntil: day(-3) }),
        input({ quotationId: 5, deletedAt: day(-1), validUntil: day(-3) }),
        input({ quotationId: 6, validUntil: day(-3) }),
      ],
      NOW,
    )
    expect(rows.map((r) => r.quotationId)).toEqual([6])
    expect(rows[0].tahap).toBe("LEWAT_BELUM_TERKIRIM")
    expect(rows[0].sisaHari).toBe(-3)
  })

  it("AC-QD-2: validUntil hari ini sisa 0 = MENIPIS bukan lewat; kemarin lewat 1 hari, cocok guard", () => {
    expect(deriveQuotationDraftStage(day(0), TODAY)).toEqual({ tahap: "MENIPIS", sisaHari: 0 })
    expect(isQuotationExpired(day(0), NOW)).toBe(false)
    expect(deriveQuotationDraftStage(day(-1), TODAY)).toEqual({
      tahap: "LEWAT_BELUM_TERKIRIM",
      sisaHari: -1,
    })
    expect(isQuotationExpired(day(-1), NOW)).toBe(true)
    expect(deriveQuotationDraftStage(day(3), TODAY)).toEqual({ tahap: "MENIPIS", sisaHari: 3 })
    expect(deriveQuotationDraftStage(day(4), TODAY)).toEqual({ tahap: "TERBUKA", sisaHari: 4 })
  })

  it("AC-QD-3/EC-QD-2: validUntil null TANPA_BATAS sisaHari null; draf tua validUntil jauh tetap TERBUKA", () => {
    const [tanpaBatas] = buildQuotationDraftQueue(
      [input({ validUntil: null, createdAt: day(-90) })],
      NOW,
    )
    expect(tanpaBatas.tahap).toBe("TANPA_BATAS")
    expect(tanpaBatas.sisaHari).toBeNull()
    expect(tanpaBatas.umurDrafHari).toBe(90)

    const [terbuka] = buildQuotationDraftQueue(
      [input({ validUntil: day(365), createdAt: day(-300) })],
      NOW,
    )
    expect(terbuka.tahap).toBe("TERBUKA")
    expect(terbuka.umurDrafHari).toBe(300)
  })

  it("Q-QD-3: urutan lewat terlama, menipis sisa terkecil, tanpa-batas umur tertua, terbuka sisa terkecil; seri documentNo asc", () => {
    const rows = buildQuotationDraftQueue(
      [
        input({ quotationId: 1, documentNo: "QUO/B", validUntil: day(-2) }),
        input({ quotationId: 2, documentNo: "QUO/A", validUntil: day(-10) }),
        input({ quotationId: 3, documentNo: "QUO/C", validUntil: day(2) }),
        input({ quotationId: 4, documentNo: "QUO/D", validUntil: day(1) }),
        input({ quotationId: 5, documentNo: "QUO/E", validUntil: null, createdAt: day(-20) }),
        input({ quotationId: 6, documentNo: "QUO/F", validUntil: null, createdAt: day(-50) }),
        input({ quotationId: 7, documentNo: "QUO/G", validUntil: day(30) }),
        input({ quotationId: 8, documentNo: "QUO/H", validUntil: day(9) }),
      ],
      NOW,
    )
    expect(rows.map((r) => r.quotationId)).toEqual([2, 1, 4, 3, 6, 5, 8, 7])
  })

  it("Q-QD-3: mode default hanya perlu-tindak; rekap atas populasi penuh (AC-QD-8)", () => {
    const rows = buildQuotationDraftQueue(
      [
        input({ quotationId: 1, validUntil: day(-1) }),
        input({ quotationId: 2, validUntil: day(2) }),
        input({ quotationId: 3, validUntil: null }),
        input({ quotationId: 4, validUntil: day(30) }),
      ],
      NOW,
    )
    expect(filterQuotationDraftQueue(rows).map((r) => r.quotationId)).toEqual([1, 2])
    expect(filterQuotationDraftQueue(rows, "semua")).toHaveLength(4)
    expect(countQuotationDraftStages(rows)).toEqual({
      LEWAT_BELUM_TERKIRIM: 1,
      MENIPIS: 1,
      TERBUKA: 1,
      TANPA_BATAS: 1,
    })
  })

  it("EC-QD-5: satu now konsisten — baris di batas tengah malam dinilai dengan hari yang sama", () => {
    const rows = buildQuotationDraftQueue(
      [input({ quotationId: 1, validUntil: day(0) }), input({ quotationId: 2, validUntil: day(-1) })],
      NOW,
    )
    expect(rows.find((r) => r.quotationId === 1)?.sisaHari).toBe(0)
    expect(rows.find((r) => r.quotationId === 2)?.sisaHari).toBe(-1)
  })

  it("umur masa depan = 0 bukan negatif; grandTotal 0 tampil apa adanya (EC-QD-7)", () => {
    const [row] = buildQuotationDraftQueue(
      [input({ createdAt: day(2), grandTotal: 0 })],
      NOW,
    )
    expect(row.umurDrafHari).toBe(0)
    expect(row.grandTotal).toBe(0)
  })
})

describe("getQuotationDraftQueue (loader fail-closed)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue(undefined)
    mocks.employeeFindMany.mockResolvedValue([{ id: 7, name: "Sales Uji" }])
    mocks.quotationFindMany.mockResolvedValue([])
  })

  it("AC-QD-5: tanpa izin loader menolak sebelum query apa pun", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Tidak memiliki izin"))
    await expect(getQuotationDraftQueue(NOW)).rejects.toThrow("Tidak memiliki izin")
    expect(mocks.requirePermission).toHaveBeenCalledWith("view_quotations")
    expect(mocks.quotationFindMany).not.toHaveBeenCalled()
    expect(mocks.employeeFindMany).not.toHaveBeenCalled()
  })

  it("AC-QD-1/7: query populasi draft persis; penjual dari salesEmployeeId->Employee massal, null tanpa fallback createdBy", async () => {
    mocks.quotationFindMany.mockResolvedValue([
      {
        id: 1,
        slug: "quo-1",
        documentNo: "QUO/2026/001",
        status: "draft",
        deletedAt: null,
        customerId: 10,
        salesEmployeeId: 7,
        date: day(-5),
        validUntil: day(-2),
        createdAt: day(-5),
        grandTotal: 1500,
        customer: { name: "PT Uji" },
      },
      {
        id: 2,
        slug: null,
        documentNo: "QUO/2026/002",
        status: "draft",
        deletedAt: null,
        customerId: 11,
        salesEmployeeId: null,
        date: day(-1),
        validUntil: null,
        createdAt: day(-1),
        grandTotal: 0,
        customer: { name: "PT Lain" },
      },
    ])

    const queue = await getQuotationDraftQueue(NOW)

    expect(mocks.quotationFindMany).toHaveBeenCalledTimes(1)
    const arg = mocks.quotationFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({ status: "draft", deletedAt: null })
    // Tanpa hitung item (Q-QD-6) dan tanpa kontak pelanggan (BR-QD-07).
    expect(JSON.stringify(arg.select)).not.toContain("items")
    expect(JSON.stringify(arg.select)).not.toContain("phone")
    expect(JSON.stringify(arg.select)).not.toContain("contactPerson")
    expect(JSON.stringify(arg.select)).not.toContain("createdBy")

    expect(mocks.employeeFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.employeeFindMany.mock.calls[0][0].where).toEqual({ id: { in: [7] } })

    const withSeller = queue.rows.find((r) => r.quotationId === 1)
    expect(withSeller?.salesEmployeeName).toBe("Sales Uji")
    expect(withSeller?.grandTotal).toBe(1500)
    const noSeller = queue.rows.find((r) => r.quotationId === 2)
    expect(noSeller?.salesEmployeeId).toBeNull()
    expect(noSeller?.salesEmployeeName).toBeNull()
    expect(queue.totalDocuments).toBe(2)
    expect(queue.noticeText).toBe(QUOTATION_DRAFT_NOTICE_TEXT)
    // Baca-saja: nol mutasi.
    expect(mocks.quotationUpdate).not.toHaveBeenCalled()
    expect(mocks.quotationCreate).not.toHaveBeenCalled()
  })
})
