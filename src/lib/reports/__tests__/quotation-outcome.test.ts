import { describe, it, expect } from "vitest"
import {
  LOST_REASON_CATEGORIES,
  buildQuotationOutcomeSummary,
  formatLostReasonReason,
  isLostReasonCategoryKey,
  lostReasonLabel,
  parseLostReasonCategory,
} from "../quotation-outcome"

describe("quotation-outcome (F-2026-10-20-101)", () => {
  it("kamus kategori khas bengkel tetap dan berlabel Indonesia", () => {
    expect(LOST_REASON_CATEGORIES.map((c) => c.key)).toEqual([
      "harga",
      "waktu-pengerjaan",
      "part-tak-tersedia",
      "pelanggan-menunda",
      "pilih-bengkel-lain",
      "spesifikasi-berubah",
      "lainnya",
    ])
    for (const c of LOST_REASON_CATEGORIES) expect(c.label.length).toBeGreaterThan(0)
    expect(isLostReasonCategoryKey("harga")).toBe(true)
    expect(isLostReasonCategoryKey("murah")).toBe(false)
    expect(isLostReasonCategoryKey(undefined)).toBe(false)
  })

  it("format reason lalu terbaca dari description histori server", () => {
    const reason = formatLostReasonReason({
      category: "waktu-pengerjaan",
      freeText: "Minta selesai besok",
    })
    expect(reason).toBe("[kalah:waktu-pengerjaan] Minta selesai besok")
    // Bentuk description yang benar-benar ditulis rejectQuotation.
    const description = `Penawaran ditolak oleh pelanggan (revisi v3) — Alasan: ${reason}`
    expect(parseLostReasonCategory(description)).toBe("waktu-pengerjaan")
  })

  it("teks bebas kosong menyisakan awalan kategori saja", () => {
    const reason = formatLostReasonReason({ category: "harga" })
    expect(reason).toBe("[kalah:harga]")
    expect(parseLostReasonCategory(reason)).toBe("harga")
  })

  it("penolakan lama tanpa awalan tidak ditebak kategorinya", () => {
    expect(parseLostReasonCategory("Penawaran ditolak oleh pelanggan — Alasan: mahal")).toBeNull()
    expect(parseLostReasonCategory("[kalah:tidak-dikenal] Penawaran ditolak")).toBeNull()
    expect(parseLostReasonCategory(null)).toBeNull()
    expect(parseLostReasonCategory(undefined)).toBeNull()
  })

  it("ringkasan: menang/kalah/konversi dan ember tak-tercatat terpisah", () => {
    const summary = buildQuotationOutcomeSummary([
      { status: "accepted", hasConversion: true },
      { status: "accepted", hasConversion: false },
      {
        status: "rejected",
        rejectionDescription: `Penawaran ditolak oleh pelanggan (revisi v1) — Alasan: ${formatLostReasonReason({ category: "harga" })}`,
        hasConversion: false,
      },
      {
        status: "rejected",
        rejectionDescription: "Penawaran ditolak oleh pelanggan (revisi v1) — Alasan: kemahalan",
        hasConversion: false,
      },
      { status: "sent", hasConversion: false },
    ])
    expect(summary.totalQuotations).toBe(5)
    expect(summary.accepted).toBe(2)
    expect(summary.rejected).toBe(2)
    expect(summary.converted).toBe(1)
    expect(summary.winRate).toBeCloseTo(0.5)
    expect(summary.conversionRate).toBeCloseTo(0.5)
    expect(summary.lostByCategory).toEqual([
      { key: "harga", label: lostReasonLabel("harga"), count: 1 },
      { key: "tak-tercatat", label: lostReasonLabel("tak-tercatat"), count: 1 },
    ])
  })

  it("tanpa keputusan: tingkat menang/konversi null, bukan 0 yang menyesatkan", () => {
    const summary = buildQuotationOutcomeSummary([{ status: "draft", hasConversion: false }])
    expect(summary.winRate).toBeNull()
    expect(summary.conversionRate).toBeNull()
    expect(summary.lostByCategory).toEqual([])
  })
})
