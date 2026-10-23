// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { DeferredTaxCard } from "../deferred-tax-card"
import {
  buildDeferredTaxTemporaryDifference,
  DEFERRED_TAX_NOTICE,
  type DeferredTaxAssetInput,
} from "@/lib/reports/deferred-tax"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

const AS_OF = new Date(Date.UTC(2025, 11, 31))

function asset(overrides: Partial<DeferredTaxAssetInput> = {}): DeferredTaxAssetInput {
  return {
    code: "AST-1",
    name: "Laptop",
    categoryName: "Elektronik",
    purchaseCost: 12_000_000,
    bookValue: 9_000_000,
    purchaseDate: new Date(Date.UTC(2025, 0, 15)),
    taxGroupCode: "GROUP_1",
    taxTypeListed: true,
    taxDjpDetermination: false,
    hasPostedBooks: true,
    ...overrides,
  }
}

describe("DeferredTaxCard F-2026-10-23-112", () => {
  it("tampilkan arah, tangguhan, verdict, dan notice verbatim tanpa tombol jurnal", () => {
    const report = buildDeferredTaxTemporaryDifference({
      assets: [
        asset({ code: "A", bookValue: 12_000_000 }),
        asset({ code: "B", name: "Mesin", bookValue: 6_000_000 }),
        asset({ code: "C", name: "Legacy", hasPostedBooks: false }),
      ],
      taxRatePercent: 22,
      asOf: AS_OF,
    })
    const { container, root } = renderCard(<DeferredTaxCard report={report} />)
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Perbedaan Temporer Pajak Tangguhan"]')).not.toBeNull()
    expect(text).toContain("Kena pajak (liabilitas)")
    expect(text).toContain("Dapat dikurangkan (aset)")
    expect(text).toContain("Belum dapat dihitung")
    expect(text).toContain(DEFERRED_TAX_NOTICE)
    expect(text).toContain(report.verdict)
    // Ringkasan totals verbatim builder (bukan hitung ulang UI).
    expect(text).toContain("liabilitas Rp 660.000")
    expect(text).toContain("aset Rp 660.000")
    expect(container.querySelector("button")).toBeNull()
    expect(container.querySelector("a")).toBeNull()
    unmountCard(root)
  })

  it("tarif tidak sah: tampilkan verdict fail-closed builder, nol tangguhan", () => {
    const report = buildDeferredTaxTemporaryDifference({
      assets: [asset()],
      taxRatePercent: null,
      asOf: AS_OF,
    })
    const { container, root } = renderCard(<DeferredTaxCard report={report} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Pajak tangguhan tidak dihitung: tarif badan tidak sah")
    expect(text).toContain("Tarif pajak badan tidak sah")
    expect(text).toContain(DEFERRED_TAX_NOTICE)
    // Pada tarif tidak sah builder hanya menaruh notice gabungan di tabel;
    // kemunculan kedua membuktikan <p> notice kartu sendiri.
    expect(text.split(DEFERRED_TAX_NOTICE).length - 1).toBeGreaterThanOrEqual(2)
    expect(container.querySelector("button")).toBeNull()
    unmountCard(root)
  })

  it("keadaan kosong tampil pesan, bukan tabel", () => {
    const report = buildDeferredTaxTemporaryDifference({
      assets: [],
      taxRatePercent: 22,
      asOf: AS_OF,
    })
    const { container, root } = renderCard(<DeferredTaxCard report={report} />)
    expect(container.textContent ?? "").toContain("Tidak ada aset untuk dinilai")
    expect(container.querySelector("table")).toBeNull()
    unmountCard(root)
  })
})
