// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { MinStockWarehouseCard } from "../min-stock-warehouse-card"
import { buildMinStockByWarehouse } from "@/lib/reports/min-stock"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

describe("MinStockWarehouseCard F-2026-10-21-013 + label sumber F-2026-10-22-070-E", () => {
  it("render baris per gudang verbatim builder + label sumber per baris + warehouseNote backend verbatim", () => {
    const shortages = buildMinStockByWarehouse([
      { itemId: 1, sku: "BRG-001", name: "Plat Besi 3mm", warehouseId: 2, warehouseName: "Gudang Bengkel", qtyAtWarehouse: 0, minStock: 5, minStockSource: "override", cost: 100_000 },
      { itemId: 1, sku: "BRG-001", name: "Plat Besi 3mm", warehouseId: 1, warehouseName: "Gudang Pusat", qtyAtWarehouse: 20, minStock: 5, cost: 100_000 },
      { itemId: 2, sku: "BRG-002", name: "Pipa Galvanis", warehouseId: 2, warehouseName: "Gudang Bengkel", qtyAtWarehouse: 2, minStock: 4, cost: 50_000 },
    ])
    // builder: gudang pusat 20 > min 5 tidak masuk daftar; urut nilai kurang terbesar
    expect(shortages).toHaveLength(2)
    // sumber default builder = global bila tidak diteruskan; baris override verbatim
    expect(shortages.find((s) => s.sku === "BRG-001")?.minStockSource).toBe("override")
    expect(shortages.find((s) => s.sku === "BRG-002")?.minStockSource).toBe("global")
    const { container, root } = renderCard(
      <MinStockWarehouseCard
        shortages={shortages}
        note="Per gudang: minimum masih global — batas Item.minStock yang sama dibandingkan ke stok tiap gudang; minimum per gudang belum diatur."
      />,
    )
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Stok Minimum per Gudang"]')).not.toBeNull()
    // label sumber verbatim BR-MS-04 per baris (konstanta backend)
    expect(text).toContain("Minimum per gudang")
    expect(text).toContain("Minimum global (warisi)")
    expect(text).toContain("Gudang Bengkel")
    expect(text).toContain("Plat Besi 3mm")
    expect(text).toContain("Pipa Galvanis")
    expect(text).toContain(
      "Per gudang: minimum masih global — batas Item.minStock yang sama dibandingkan ke stok tiap gudang; minimum per gudang belum diatur.",
    )
    expect(text).toContain("Rp 500.000")
    expect(text).toContain("Rp 100.000")
    expect(text).not.toContain("Gudang Pusat")
    unmountCard(root)
  })

  it("semua baris override: ringkasan menyebut semua baris Minimum per gudang, tanpa label global", () => {
    const shortages = buildMinStockByWarehouse([
      { itemId: 1, sku: "BRG-001", name: "Plat Besi 3mm", warehouseId: 2, warehouseName: "Gudang Bengkel", qtyAtWarehouse: 0, minStock: 5, minStockSource: "override", cost: 100_000 },
    ])
    const { container, root } = renderCard(
      <MinStockWarehouseCard
        shortages={shortages}
        note="Per gudang: semua batas memakai minimum per gudang (ItemWarehouseSetting); tidak ada baris yang mewarisi minimum global."
      />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("semua baris Minimum per gudang")
    expect(text).not.toContain("Minimum global (warisi)")
    unmountCard(root)
  })

  it("daftar kosong tampil pesan, bukan tabel", () => {
    const { container, root } = renderCard(<MinStockWarehouseCard shortages={[]} />)
    expect(container.textContent ?? "").toContain("Tidak ada barang di bawah minimum pada gudang mana pun")
    expect(container.querySelector("table")).toBeNull()
    unmountCard(root)
  })
})
