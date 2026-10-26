import { describe, it, expect } from "vitest"
import {
  QUOTATION_DRAFT_EXPIRY_WARNING_DAYS,
  QUOTATION_DRAFT_NOTICE_TEXT,
  QUOTATION_DRAFT_QUEUE_TITLE_TEXT,
  QUOTATION_DRAFT_STAGE_LABELS,
  buildQuotationDraftQueue,
  deriveQuotationDraftStage,
  filterQuotationDraftQueue,
  type QuotationDraftInput,
} from "../quotation-draft-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

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

describe("quotation-draft-queue (F-2026-10-26-055-S tahap 1)", () => {
  it("konstanta ambang + kata verbatim putusan Q-QD-1/2", () => {
    expect(QUOTATION_DRAFT_EXPIRY_WARNING_DAYS).toBe(3)
    expect(QUOTATION_DRAFT_QUEUE_TITLE_TEXT).toBe("Draf Penawaran Basi")
    expect(QUOTATION_DRAFT_NOTICE_TEXT).toBe(
      "Daftar ini hanya penawaran yang masih draft dan belum pernah dikirim. Draf belum menjadi penawaran ke pelanggan; kirim, revisi, atau hapus lewat detail penawaran.",
    )
    expect(QUOTATION_DRAFT_STAGE_LABELS).toEqual({
      LEWAT_BELUM_TERKIRIM: "Lewat Masa Berlaku — Belum Terkirim",
      MENIPIS: "Masa Berlaku Menipis",
      TERBUKA: "Terbuka",
      TANPA_BATAS: "Tanpa Masa Berlaku",
    })
  })

  it("AC-QD-1: sent/accepted/terhapus tidak pernah masuk populasi", () => {
    const queue = buildQuotationDraftQueue(
      [
        input({ quotationId: 1, status: "sent", validUntil: day(-4) }),
        input({ quotationId: 2, status: "accepted", validUntil: day(-4) }),
        input({ quotationId: 3, deletedAt: day(0), validUntil: day(-4) }),
        input({ quotationId: 4, validUntil: day(-4) }),
      ],
      NOW,
    )
    expect(queue.rows.map((r) => r.quotationId)).toEqual([4])
    expect(queue.rows[0].sisaHari).toBe(-4)
  })

  it("AC-QD-2: hari validUntil sendiri sisa 0 (MENIPIS, bukan LEWAT); kemarin lewat 1", () => {
    expect(deriveQuotationDraftStage(day(0), TODAY)).toEqual({ tahap: "MENIPIS", sisaHari: 0 })
    expect(deriveQuotationDraftStage(day(-1), TODAY)).toEqual({
      tahap: "LEWAT_BELUM_TERKIRIM",
      sisaHari: -1,
    })
    expect(deriveQuotationDraftStage(day(3), TODAY)).toEqual({ tahap: "MENIPIS", sisaHari: 3 })
    expect(deriveQuotationDraftStage(day(4), TODAY)).toEqual({ tahap: "TERBUKA", sisaHari: 4 })
  })

  it("AC-QD-3: validUntil null = TANPA_BATAS, sisaHari null (tanpa karangan)", () => {
    const queue = buildQuotationDraftQueue(
      [input({ validUntil: null, createdAt: day(-40) })],
      NOW,
    )
    expect(queue.rows[0].tahap).toBe("TANPA_BATAS")
    expect(queue.rows[0].sisaHari).toBeNull()
    expect(queue.rows[0].umurDraftHari).toBe(40)
  })

  it("Q-QD-3: urutan tahap + seri documentNo asc; filter default hanya perlu-tindak", () => {
    const queue = buildQuotationDraftQueue(
      [
        input({ quotationId: 1, documentNo: "QUO/B", validUntil: day(10) }),
        input({ quotationId: 2, documentNo: "QUO/C", validUntil: day(-1) }),
        input({ quotationId: 3, documentNo: "QUO/A", validUntil: day(-5) }),
        input({ quotationId: 4, documentNo: "QUO/D", validUntil: day(2) }),
        input({ quotationId: 5, documentNo: "QUO/E", validUntil: null, createdAt: day(-1) }),
        input({ quotationId: 6, documentNo: "QUO/F", validUntil: null, createdAt: day(-9) }),
      ],
      NOW,
    )
    // LEWAT paling lama-lewat dulu (-5 < -1), MENIPIS, TANPA_BATAS tertua, TERBUKA.
    expect(queue.rows.map((r) => r.quotationId)).toEqual([3, 2, 4, 6, 5, 1])
    expect(filterQuotationDraftQueue(queue.rows).map((r) => r.quotationId)).toEqual([3, 2, 4])
    expect(filterQuotationDraftQueue(queue.rows, "semua")).toHaveLength(6)
  })

  it("AC-QD-8: rekap = populasi penuh (Σ rekap = Σ baris), bukan subset tampil", () => {
    const queue = buildQuotationDraftQueue(
      [
        input({ quotationId: 1, validUntil: day(-2), grandTotal: 100.5 }),
        input({ quotationId: 2, validUntil: day(1), grandTotal: 200 }),
        input({ quotationId: 3, validUntil: day(30), grandTotal: 300 }),
      ],
      NOW,
    )
    expect(queue.stageCounts).toEqual({
      LEWAT_BELUM_TERKIRIM: 1,
      MENIPIS: 1,
      TERBUKA: 1,
      TANPA_BATAS: 0,
    })
    expect(Object.values(queue.stageCounts).reduce((a, b) => a + b, 0)).toBe(queue.rows.length)
    expect(queue.totalGrandTotal).toBe(600.5)
  })

  it("AC-QD-7/EC: penjual null dan grandTotal 0 tampil apa adanya; createdAt masa depan umur 0", () => {
    const queue = buildQuotationDraftQueue(
      [
        input({
          salesEmployeeId: null,
          salesEmployeeName: null,
          grandTotal: 0,
          createdAt: day(2),
          validUntil: day(2),
        }),
      ],
      NOW,
    )
    expect(queue.rows[0].salesEmployeeName).toBeNull()
    expect(queue.rows[0].grandTotal).toBe(0)
    expect(queue.rows[0].umurDraftHari).toBe(0)
  })
})
