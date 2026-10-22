// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { FitmentBadge, FitmentIncompatibleSummary } from "../fitment-badge"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

describe("FitmentBadge F-2026-10-22-063-S", () => {
  it("incompatible: peringatan keras persis + tautan aturan pemenang", () => {
    const { container, root } = renderCard(
      <FitmentBadge fitmentResult="incompatible" fitmentRuleId={42} />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Tidak cocok untuk kendaraan ini")
    const link = container.querySelector('a[href="/kendaraan/fitment/42"]')
    expect(link).not.toBeNull()
    expect(link?.textContent).toContain("Lihat aturan fitment")
    // kata terlarang spec: dokumen tetap sah, bukan ditolak
    expect(text.toLowerCase()).not.toContain("dilarang")
    expect(text.toLowerCase()).not.toContain("ditolak")
    unmountCard(root)
  })

  it("incompatible tanpa ruleId: peringatan tampil, tautan tidak ada", () => {
    const { container, root } = renderCard(
      <FitmentBadge fitmentResult="incompatible" fitmentRuleId={null} />,
    )
    expect(container.textContent).toContain("Tidak cocok untuk kendaraan ini")
    expect(container.querySelector("a")).toBeNull()
    unmountCard(root)
  })

  it("unknown: lencana netral persis, tanpa tautan", () => {
    const { container, root } = renderCard(
      <FitmentBadge fitmentResult="unknown" fitmentRuleId={null} />,
    )
    expect(container.textContent).toContain("Belum ada aturan fitment")
    expect(container.querySelector("a")).toBeNull()
    unmountCard(root)
  })

  it("compatible/null/undefined: tanpa lencana", () => {
    for (const result of ["compatible", null, undefined] as const) {
      const { container, root } = renderCard(
        <FitmentBadge fitmentResult={result} fitmentRuleId={7} />,
      )
      expect(container.textContent ?? "").toBe("")
      unmountCard(root)
    }
  })
})

describe("FitmentIncompatibleSummary F-2026-10-22-063-S", () => {
  it("hitungan >0: ringkasan tampil, dokumen tetap sah", () => {
    const { container, root } = renderCard(
      <FitmentIncompatibleSummary incompatibleCount={3} />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("3 baris tidak cocok untuk kendaraan ini")
    expect(text).toContain("dokumen tetap dapat dilanjutkan")
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    unmountCard(root)
  })

  it("hitungan 0: senyap", () => {
    const { container, root } = renderCard(
      <FitmentIncompatibleSummary incompatibleCount={0} />,
    )
    expect(container.textContent ?? "").toBe("")
    unmountCard(root)
  })
})
