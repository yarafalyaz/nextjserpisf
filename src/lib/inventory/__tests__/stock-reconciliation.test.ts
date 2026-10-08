import { describe, it, expect } from "vitest"
import {
  reconcileItem,
  isBalanced,
  reconcileInventory,
  type ItemLayerTotals,
} from "@/lib/inventory/stock-reconciliation"

describe("reconcileItem", () => {
  it("marks an item balanced when master qty equals layer qty", () => {
    const row = reconcileItem({
      itemId: 1, sku: "A", name: "Item A", masterQty: 10,
      layers: { layerQty: 10, layerValue: 250 },
    })
    expect(row.variance).toBe(0)
    expect(isBalanced(row)).toBe(true)
  })

  it("flags master over-reporting (master > layers)", () => {
    const row = reconcileItem({
      itemId: 1, sku: "A", name: "Item A", masterQty: 10,
      layers: { layerQty: 7, layerValue: 100 },
    })
    expect(row.variance).toBe(3)
    expect(isBalanced(row)).toBe(false)
  })

  it("flags master under-reporting (master < layers)", () => {
    const row = reconcileItem({
      itemId: 1, sku: "A", name: "Item A", masterQty: 5,
      layers: { layerQty: 8, layerValue: 100 },
    })
    expect(row.variance).toBe(-3)
    expect(isBalanced(row)).toBe(false)
  })

  it("treats FP noise below the storage scale as balanced", () => {
    // 0.1 + 0.2 style drift must not produce a phantom mismatch.
    const row = reconcileItem({
      itemId: 1, sku: "A", name: "Item A", masterQty: 0.3,
      layers: { layerQty: 0.1 + 0.2, layerValue: 0 },
    })
    expect(row.variance).toBe(0)
    expect(isBalanced(row)).toBe(true)
  })

  it("handles non-finite input as zero", () => {
    const row = reconcileItem({
      itemId: 1, sku: "A", name: "Item A", masterQty: Number.NaN,
      layers: { layerQty: Number.POSITIVE_INFINITY, layerValue: Number.NaN },
    })
    expect(row.masterQty).toBe(0)
    expect(row.layerQty).toBe(0)
    expect(row.layerValue).toBe(0)
  })
})

describe("reconcileInventory", () => {
  const totals = (entries: [number, number, number][]) => {
    const m = new Map<number, ItemLayerTotals>()
    for (const [itemId, qty, value] of entries) m.set(itemId, { layerQty: qty, layerValue: value })
    return m
  }

  it("splits balanced items from mismatches", () => {
    const summary = reconcileInventory(
      [
        { itemId: 1, sku: "A", name: "A", masterQty: 10 },
        { itemId: 2, sku: "B", name: "B", masterQty: 4 },
      ],
      totals([[1, 10, 100], [2, 6, 60]]),
    )
    expect(summary.totalItems).toBe(2)
    expect(summary.mismatchCount).toBe(1)
    expect(summary.mismatches[0].itemId).toBe(2)
    expect(summary.mismatches[0].variance).toBe(-2)
  })

  it("flags an item with a master counter but no layers", () => {
    const summary = reconcileInventory(
      [{ itemId: 9, sku: "Z", name: "Z", masterQty: 3 }],
      new Map(),
    )
    expect(summary.mismatchCount).toBe(1)
    expect(summary.mismatches[0].layerQty).toBe(0)
    expect(summary.mismatches[0].variance).toBe(3)
  })

  it("sums totals across ALL items (not just mismatches)", () => {
    const summary = reconcileInventory(
      [
        { itemId: 1, sku: "A", name: "A", masterQty: 10 },
        { itemId: 2, sku: "B", name: "B", masterQty: 5 },
      ],
      totals([[1, 10, 100], [2, 8, 96]]),
    )
    expect(summary.totalMasterQty).toBe(15)
    expect(summary.totalLayerQty).toBe(18)
    expect(summary.totalLayerValue).toBe(196)
  })

  it("returns no mismatches when every item balances", () => {
    const summary = reconcileInventory(
      [{ itemId: 1, sku: "A", name: "A", masterQty: 2 }],
      totals([[1, 2, 20]]),
    )
    expect(summary.mismatchCount).toBe(0)
    expect(summary.mismatches).toHaveLength(0)
  })
})
