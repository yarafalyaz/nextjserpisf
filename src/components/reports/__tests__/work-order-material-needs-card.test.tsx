// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { WorkOrderMaterialNeedsCard } from "../work-order-material-needs-card"
import { buildWorkOrderMaterialNeeds } from "@/lib/reports/work-order-material-needs"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

describe("WorkOrderMaterialNeedsCard F-2026-10-20-19", () => {
  it("render per baris butuh/tersedia/keluar/dipesan/sisa/kurang + jasa terpenuhi", () => {
    const needs = buildWorkOrderMaterialNeeds([
      { itemId: 1, name: "Busi Iridium", unitOfMeasure: "pcs", requiredQty: 4, qtyOnHand: 1, issuedQty: 1, orderedQty: 2 },
      { itemId: 0, name: "Jasa / baris custom", unitOfMeasure: "", requiredQty: 0, qtyOnHand: 0, issuedQty: 0, orderedQty: 0 },
    ])
    const { container, root } = renderCard(<WorkOrderMaterialNeedsCard needs={needs} />)
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Kebutuhan Material"]')).not.toBeNull()
    expect(text).toContain("Busi Iridium")
    expect(text).toContain("Kekurangan stok")
    expect(text).toContain("Jasa — terpenuhi")
    expect(text).toContain("1 baris kekurangan stok")
    unmountCard(root)
  })

  it("semua terpenuhi tampil ringkasan terpenuhi", () => {
    const needs = buildWorkOrderMaterialNeeds([
      { itemId: 2, name: "Oli Mesin", unitOfMeasure: "liter", requiredQty: 2, qtyOnHand: 5, issuedQty: 2, orderedQty: 0 },
    ])
    const { container, root } = renderCard(<WorkOrderMaterialNeedsCard needs={needs} />)
    expect(container.textContent).toContain("Semua kebutuhan terpenuhi")
    unmountCard(root)
  })

  it("kosong tampil pesan belum ada kebutuhan", () => {
    const needs = buildWorkOrderMaterialNeeds([])
    const { container, root } = renderCard(<WorkOrderMaterialNeedsCard needs={needs} />)
    expect(container.textContent).toContain("Belum ada kebutuhan material")
    unmountCard(root)
  })
})
