// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { QuotationRevisionDeltaCard } from "../quotation-revision-delta-card"
import { buildQuotationRevisionDelta } from "@/lib/reports/quotation-revision-delta"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

describe("QuotationRevisionDeltaCard F-2026-10-20-103", () => {
  it("tanpa snapshot: tidak tampil sama sekali", () => {
    const delta = buildQuotationRevisionDelta({
      quotationId: 1, revisionNumber: 0, snapshotGrandTotal: null, currentGrandTotal: 100_000_000,
    })
    const { container, root } = renderCard(<QuotationRevisionDeltaCard delta={delta} />)
    expect(container.querySelector('[aria-label="Selisih Revisi Penawaran"]')).toBeNull()
    unmountCard(root)
  })

  it("delta null: tidak tampil", () => {
    const { container, root } = renderCard(<QuotationRevisionDeltaCard delta={null} />)
    expect(container.querySelector('[aria-label="Selisih Revisi Penawaran"]')).toBeNull()
    unmountCard(root)
  })

  it("naik: tampil snapshot, berjalan, selisih, jalur faktur selisih + notice verbatim", () => {
    const delta = buildQuotationRevisionDelta({
      quotationId: 1, revisionNumber: 2, snapshotGrandTotal: 80_000_000, currentGrandTotal: 100_000_000,
    })
    const { container, root } = renderCard(<QuotationRevisionDeltaCard delta={delta} />)
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Selisih Revisi Penawaran"]')).not.toBeNull()
    expect(text).toContain("Naik")
    expect(text).toContain("Faktur selisih")
    expect(text).toContain(delta.notice)
    unmountCard(root)
  })

  it("turun: jalur kredit revisi-turun", () => {
    const delta = buildQuotationRevisionDelta({
      quotationId: 1, revisionNumber: 1, snapshotGrandTotal: 100_000_000, currentGrandTotal: 90_000_000,
    })
    const { container, root } = renderCard(<QuotationRevisionDeltaCard delta={delta} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Turun")
    expect(text).toContain("Kredit revisi-turun")
    unmountCard(root)
  })
})
