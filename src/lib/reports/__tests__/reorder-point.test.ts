import { describe, expect, it } from "vitest"
import { buildReorderPoints, type ReorderPointInput } from "../reorder-point"

/**
 * Titik pesan-ulang F-2026-10-25-048-S (BR-ROP-01..08, putusan Lead
 * Q-ROP-1/2/3). Falsifikasi wajib kartu 048-B1:
 * - lead time kosong tampil sebagai saran = MERAH (AC-ROP-B1).
 * - label kritis hilang karena PO masuk besar = MERAH (AC-ROP-B4).
 */

function row(over: Partial<ReorderPointInput> = {}): ReorderPointInput {
  return {
    itemId: 1,
    sku: "BRG-1",
    name: "Busi",
    unit: "pcs",
    warehouseId: 2,
    warehouseName: "Gudang Bengkel",
    qtyAtWarehouse: 10,
    minStock: 5,
    minStockSource: "override",
    leadTimeDays: 7,
    dailyUsage: 1,
    incomingQty: 0,
    ...over,
  }
}

describe("buildReorderPoints", () => {
  it("AC-ROP-B1: lead time kosong -> tidak_dinilai terhitung, tanpa titik/saran", () => {
    const r = buildReorderPoints([row({ leadTimeDays: null, qtyAtWarehouse: 0 })])
    expect(r.lines[0]).toMatchObject({
      status: "tidak_dinilai",
      notAssessedReason: "lead_time_kosong",
      reorderPoint: null,
      suggestedQty: null,
    })
    expect(r.counts).toMatchObject({ assessed: 0, notAssessed: 1, orderNow: 0 })
  })

  it("tanpa lapisan dan minimum 0 juga tidak_dinilai dengan alasan terpisah", () => {
    const r = buildReorderPoints([
      row({ qtyAtWarehouse: null }),
      row({ itemId: 2, sku: "BRG-2", minStock: 0 }),
    ])
    expect(r.lines.map((l) => l.notAssessedReason).sort()).toEqual([
      "minimum_nol",
      "tanpa_lapisan",
    ])
    expect(r.counts.notAssessed).toBe(2)
  })

  it("rumus BR-ROP-02: titik = minimum efektif + ceil(laju x lead time)", () => {
    // laju 0,4/hari x 7 hari = 2,8 -> ceil 3; titik = 5 + 3 = 8.
    const r = buildReorderPoints([row({ dailyUsage: 0.4, qtyAtWarehouse: 20 })])
    expect(r.lines[0]).toMatchObject({ reorderPoint: 8, status: "aman", suggestedQty: 0 })
  })

  it("AC-ROP-B3: minimum efektif berubah (override vs global) mengubah titik", () => {
    const override = buildReorderPoints([row({ minStock: 5 })]).lines[0]
    const global = buildReorderPoints([
      row({ minStock: 2, minStockSource: "global" }),
    ]).lines[0]
    expect(override.reorderPoint).toBe(12)
    expect(global.reorderPoint).toBe(9)
  })

  it("laju 0 dengan lead time terisi -> titik = minimum, tertanda persis 'tanpa laju'", () => {
    const r = buildReorderPoints([row({ dailyUsage: 0, qtyAtWarehouse: 3 })])
    expect(r.lines[0]).toMatchObject({
      reorderPoint: 5,
      usageNote: "tanpa laju",
      status: "pesan_sekarang",
      suggestedQty: 2,
    })
  })

  it("AC-ROP-B2: tersedia + PO masuk tepat = titik -> pesan_sekarang saran 0 (baris tidak hilang)", () => {
    // titik 12; tersedia 8 + PO masuk 4 = 12.
    const r = buildReorderPoints([row({ qtyAtWarehouse: 8, incomingQty: 4 })])
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0]).toMatchObject({ status: "pesan_sekarang", suggestedQty: 0 })
    expect(r.counts.orderNow).toBe(1)
  })

  it("AC-ROP-B4 FALSIFIKASI: stok kritis + PO masuk besar -> kritis tetap, pesan_sekarang lepas", () => {
    const r = buildReorderPoints([row({ qtyAtWarehouse: 2, incomingQty: 100 })])
    expect(r.lines[0].isCritical).toBe(true)
    expect(r.lines[0].status).toBe("aman")
    expect(r.counts.critical).toBe(1)
  })

  it("saran BR-ROP-04 = kekurangan ke titik sesudah PO masuk", () => {
    // titik 12; tersedia 8 + PO 1 = 9 -> saran 3.
    const r = buildReorderPoints([row({ qtyAtWarehouse: 8, incomingQty: 1 })])
    expect(r.lines[0]).toMatchObject({ status: "pesan_sekarang", suggestedQty: 3 })
  })

  it("urut: pesan_sekarang (saran terbesar) -> aman -> tidak_dinilai", () => {
    const r = buildReorderPoints([
      row({ itemId: 3, sku: "C", leadTimeDays: null }),
      row({ itemId: 2, sku: "B", qtyAtWarehouse: 50 }),
      row({ itemId: 1, sku: "A", qtyAtWarehouse: 0 }),
    ])
    expect(r.lines.map((l) => l.sku)).toEqual(["A", "B", "C"])
  })
})
