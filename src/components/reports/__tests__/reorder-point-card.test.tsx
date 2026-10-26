// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { ReorderPointCard } from "../reorder-point-card"
import { buildReorderPoints, type ReorderPointInput } from "@/lib/reports/reorder-point"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

function row(extra: Partial<ReorderPointInput> = {}): ReorderPointInput {
  return {
    itemId: 1,
    sku: "BRG-001",
    name: "Plat Besi 3mm",
    unit: "pcs",
    warehouseId: 2,
    warehouseName: "Gudang Bengkel",
    qtyAtWarehouse: 3,
    minStock: 5,
    minStockSource: "override",
    leadTimeDays: 7,
    dailyUsage: 1,
    incomingQty: 0,
    ...extra,
  }
}

function renderReport(input: Parameters<typeof buildReorderPoints>[0]) {
  return renderCard(
    <ReorderPointCard
      result={buildReorderPoints(input)}
      usageWindowDays={90}
      usageWindowStartLabel="4 Juli 2026"
    />,
  )
}

describe("ReorderPointCard F-2026-10-25-048-S", () => {
  it("dinilai: titik + saran + status verbatim builder, kritis terpisah, tanpa laju persis server", () => {
    const { container, root } = renderReport([
      row(),
      row({ itemId: 2, sku: "BRG-002", dailyUsage: 0, qtyAtWarehouse: 20, incomingQty: 40 }),
    ])
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Titik Pesan-Ulang"]')).not.toBeNull()
    expect(text).toContain("Gudang Bengkel")
    expect(text).toContain("Plat Besi 3mm")
    expect(text).toContain("Pesan sekarang")
    expect(text).toContain("Kritis")
    expect(text).toContain("tanpa laju")
    expect(text).toContain("2 dinilai")
    expect(text).toContain("0 tidak dinilai")
    // titik baris pertama = 5 + ceil(1*7) = 12, saran = 12 - 3 = 9
    expect(text).toContain("12")
    expect(text).toContain("9")
    unmountCard(root)
  })

  it("ember tidak_dinilai terhitung: lead time kosong, tanpa lapisan, minimum nol — tanpa titik/saran", () => {
    const { container, root } = renderReport([
      row({ leadTimeDays: null }),
      row({ itemId: 2, sku: "BRG-002", qtyAtWarehouse: null }),
      row({ itemId: 3, sku: "BRG-003", minStock: 0 }),
      row({ itemId: 4, sku: "BRG-004", qtyAtWarehouse: 50 }),
    ])
    const text = container.textContent ?? ""
    expect(text).toContain("Lead time belum diisi")
    expect(text).toContain("Tanpa lapisan stok di gudang")
    expect(text).toContain("Minimum efektif 0")
    expect(text).toContain("Tidak dinilai")
    expect(text).toContain("3 tidak dinilai")
    expect(text).not.toContain("Pesan sekarang")
    expect(text).toContain("Aman")
    // baris tidak dinilai tampil "—" untuk titik dan saran
    const dashRows = [...container.querySelectorAll("tr")].filter((tr) =>
      (tr.textContent ?? "").includes("BRG-001"),
    )
    expect(dashRows[0]?.textContent).toContain("—")
    unmountCard(root)
  })

  it("aman: tersedia + PO masuk di atas titik tidak tertanda kritis", () => {
    const { container, root } = renderReport([
      row({ qtyAtWarehouse: 20, incomingQty: 10 }),
    ])
    const text = container.textContent ?? ""
    expect(text).toContain("Aman")
    expect(text).not.toContain("Kritis")
    expect(text).not.toContain("Pesan sekarang")
    unmountCard(root)
  })

  it("daftar kosong tampil pesan, bukan tabel", () => {
    const { container, root } = renderReport([])
    expect(container.textContent ?? "").toContain("Belum ada pasangan barang-gudang yang dinilai")
    expect(container.querySelector("table")).toBeNull()
    unmountCard(root)
  })
})

describe("ReorderPointCard falsifikasi payload server", () => {
  it("payload titik/saran non-turunan tampil persis — UI tidak hitung ulang", () => {
    // Nilai mustahil dari rumus ceeder: reorderPoint 999 & suggestedQty 888
    // saat qty 3, min 5, lead 7, laju 1 (rumus turun-min = 12, saran 9).
    const result = buildReorderPoints([row()])
    const line = { ...result.lines[0]!, reorderPoint: 999, suggestedQty: 888 }
    const { container, root } = renderCard(
      <ReorderPointCard
        result={{ lines: [line], counts: result.counts }}
        usageWindowDays={90}
        usageWindowStartLabel="4 Juli 2026"
      />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("999")
    expect(text).toContain("888")
    expect(text).not.toContain("12")
    unmountCard(root)
  })
})
