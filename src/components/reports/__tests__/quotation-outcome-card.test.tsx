// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { QuotationOutcomeCard } from "../quotation-outcome-card"
import {
  buildQuotationOutcomeSummary,
  formatLostReasonReason,
} from "@/lib/reports/quotation-outcome"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

describe("QuotationOutcomeCard F-2026-10-20-101", () => {
  it("render tingkat menang/konversi dan ember kategori kalah", () => {
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
    const { container, root } = renderCard(<QuotationOutcomeCard summary={summary} />)
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Hasil Penawaran"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Penolakan per Kategori Kalah"]')).not.toBeNull()
    expect(text).toContain("5 penawaran")
    expect(text).toContain("50,0%")
    expect(text).toContain("Harga terlalu tinggi")
    expect(text).toContain("Tidak tercatat (penolakan lama)")
    // Kolom hitung berlabel entitasnya (AC-REP-003), bukan "Jumlah" ambigu.
    const headers = Array.from(container.querySelectorAll("th")).map((th) => th.textContent)
    expect(headers).toEqual(["Ukuran", "Penawaran", "Kategori Kalah", "Penawaran"])
    unmountCard(root)
  })

  it("tanpa keputusan: tingkat tampil strip, bukan 0 menyesatkan", () => {
    const summary = buildQuotationOutcomeSummary([{ status: "draft", hasConversion: false }])
    const { container, root } = renderCard(<QuotationOutcomeCard summary={summary} />)
    const text = container.textContent ?? ""
    expect(text).toContain("tingkat menang –")
    expect(text).toContain("Belum ada penolakan pada periode ini")
    unmountCard(root)
  })

  it("keadaan kosong tampil pesan, bukan tabel", () => {
    const summary = buildQuotationOutcomeSummary([])
    const { container, root } = renderCard(<QuotationOutcomeCard summary={summary} />)
    expect(container.textContent ?? "").toContain("Belum ada penawaran pada periode ini")
    expect(container.querySelector("table")).toBeNull()
    unmountCard(root)
  })
})
