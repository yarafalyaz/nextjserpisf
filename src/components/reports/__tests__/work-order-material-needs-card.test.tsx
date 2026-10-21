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

  it("stok global cukup tapi gudang relevan kurang: tampil kolom + status gudang (F-012)", () => {
    const needs = buildWorkOrderMaterialNeeds([
      { itemId: 3, name: "Kampas Rem", unitOfMeasure: "set", requiredQty: 10, qtyOnHand: 12, issuedQty: 0, orderedQty: 0, qtyOnHandAtWarehouse: 3 },
    ])
    // builder: shortage global 0, warehouseShortageQty 7, count 1
    expect(needs.shortageCount).toBe(0)
    expect(needs.warehouseShortageCount).toBe(1)
    const { container, root } = renderCard(<WorkOrderMaterialNeedsCard needs={needs} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Stok gudang relevan")
    expect(text).toContain("Belum keluar — kurang di gudang relevan")
    expect(text).toContain("1 baris kekurangan di gudang relevan")
    expect(text).not.toContain("Kekurangan stok")
    unmountCard(root)
  })

  it("gudang relevan cukup: kolom tampil, status tetap belum keluar biasa (F-012)", () => {
    const needs = buildWorkOrderMaterialNeeds([
      { itemId: 4, name: "Filter Oli", unitOfMeasure: "pcs", requiredQty: 5, qtyOnHand: 9, issuedQty: 0, orderedQty: 0, qtyOnHandAtWarehouse: 9 },
    ])
    const { container, root } = renderCard(<WorkOrderMaterialNeedsCard needs={needs} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Stok gudang relevan")
    expect(text).toContain("Belum keluar")
    expect(text).not.toContain("kurang di gudang relevan")
    unmountCard(root)
  })
})
