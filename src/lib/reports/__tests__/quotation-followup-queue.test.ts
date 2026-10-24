import { describe, it, expect } from "vitest"
import {
  QUOTATION_EXPIRY_WARNING_DAYS,
  QUOTATION_FOLLOWUP_NOTICE_TEXT,
  buildQuotationFollowUpQueue,
  deriveQuotationFollowUpStage,
  filterQuotationFollowUpQueue,
  type QuotationFollowUpInput,
} from "../quotation-followup-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"
import { isQuotationExpired } from "@/lib/utils/quotation-expiry"

// Hari kalender WIB tetap: 2026-10-22 (Kamis) — instan 05:00 WIB.
const NOW = new Date("2026-10-21T22:00:00.000Z")
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function input(overrides: Partial<QuotationFollowUpInput> = {}): QuotationFollowUpInput {
  return {
    quotationId: 1,
    slug: "quo-1",
    documentNo: "QUO/2026/001",
    customerId: 10,
    customerName: "PT Uji",
    phone: null,
    contactPerson: null,
    salesEmployeeId: 7,
    salesEmployeeName: "Sales Uji",
    date: day(-5),
    validUntil: day(10),
    grandTotal: 1000,
    ...overrides,
  }
}

describe("quotation-followup-queue (F-2026-10-22-091-S tahap 1)", () => {
  it("konstanta ambang + notice verbatim spec", () => {
    expect(QUOTATION_EXPIRY_WARNING_DAYS).toBe(3)
    expect(QUOTATION_FOLLOWUP_NOTICE_TEXT).toBe(
      "Tahap dihitung dari masa berlaku penawaran terkirim. Penawaran kedaluwarsa tidak dapat diterima sebelum direvisi atau diperpanjang masa berlakunya.",
    )
  })

  it("AC-QF-1: besok MENIPIS; +10 hari TERBUKA dan hilang dari filter default", () => {
    const rows = buildQuotationFollowUpQueue(
      [input({ quotationId: 1, validUntil: day(1) }), input({ quotationId: 2, validUntil: day(10) })],
      NOW,
    )
    expect(rows.find((r) => r.quotationId === 1)?.tahap).toBe("MENIPIS")
    expect(rows.find((r) => r.quotationId === 2)?.tahap).toBe("TERBUKA")
    expect(filterQuotationFollowUpQueue(rows).map((r) => r.quotationId)).toEqual([1])
    expect(filterQuotationFollowUpQueue(rows, "semua")).toHaveLength(2)
  })

  it("AC-QF-2/4: kemarin KEDALUWARSA cocok guard; hari ini sisa 0 MENIPIS bukan kedaluwarsa", () => {
    const yesterday = deriveQuotationFollowUpStage(day(-1), TODAY)
    expect(yesterday).toEqual({ tahap: "KEDALUWARSA", sisaHari: -1 })
    expect(isQuotationExpired(day(-1), NOW)).toBe(true)

    const today = deriveQuotationFollowUpStage(day(0), TODAY)
    expect(today).toEqual({ tahap: "MENIPIS", sisaHari: 0 })
    expect(isQuotationExpired(day(0), NOW)).toBe(false)
  })

  it("AC-QF-3: validUntil kosong TANPA_BATAS sisaHari null walau umur lama", () => {
    const [row] = buildQuotationFollowUpQueue(
      [input({ validUntil: null, date: day(-90) })],
      NOW,
    )
    expect(row.tahap).toBe("TANPA_BATAS")
    expect(row.tahapLabel).toBe("Tanpa Masa Berlaku")
    expect(row.sisaHari).toBeNull()
    expect(row.umurTerkirimHari).toBe(90)
  })

  it("urutan: KEDALUWARSA terlama, MENIPIS sisa terkecil, TANPA_BATAS kirim tertua", () => {
    const rows = buildQuotationFollowUpQueue(
      [
        input({ quotationId: 1, validUntil: day(-2) }),
        input({ quotationId: 2, validUntil: day(-10) }),
        input({ quotationId: 3, validUntil: day(2) }),
        input({ quotationId: 4, validUntil: day(1) }),
        input({ quotationId: 5, validUntil: null, date: day(-3) }),
        input({ quotationId: 6, validUntil: null, date: day(-20) }),
        input({ quotationId: 7, validUntil: day(30) }),
      ],
      NOW,
    )
    expect(rows.map((r) => r.quotationId)).toEqual([2, 1, 4, 3, 6, 5, 7])
  })

  it("AC-QF-11: tanpa penjual tetap satu baris, nama null", () => {
    const [row] = buildQuotationFollowUpQueue(
      [input({ salesEmployeeId: null, salesEmployeeName: null })],
      NOW,
    )
    expect(row.salesEmployeeId).toBeNull()
    expect(row.salesEmployeeName).toBeNull()
  })

  it("AC-QF-12: validUntil tengah malam UTC hari WIB diperlakukan seperti guard", () => {
    // validUntil = tengah malam UTC hari kalender WIB besok -> sisa 1, belum lewat.
    expect(deriveQuotationFollowUpStage(day(1), TODAY).tahap).toBe("MENIPIS")
    expect(isQuotationExpired(day(1), NOW)).toBe(false)
  })
})
