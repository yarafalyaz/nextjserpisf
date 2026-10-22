import { describe, it, expect } from "vitest"
import {
  assertChangeOrderTransition,
  assertLinesNotLocked,
  assertWorkOrderEligibleForChangeOrder,
  computeChangeOrderSelisih,
  computeLockedWorkOrderItemIds,
  formatChangeOrderDocumentNo,
  isChangeOrderTransitionAllowed,
  resolveQuotationItemForChange,
} from "../job-change-order"

describe("job-change-order builder — transisi §3", () => {
  it("matriks sah persis spec", () => {
    expect(isChangeOrderTransitionAllowed("draft", "menunggu_pelanggan")).toBe(true)
    expect(isChangeOrderTransitionAllowed("menunggu_pelanggan", "disetujui")).toBe(true)
    expect(isChangeOrderTransitionAllowed("menunggu_pelanggan", "ditolak")).toBe(true)
    expect(isChangeOrderTransitionAllowed("disetujui", "diterapkan")).toBe(true)
    expect(isChangeOrderTransitionAllowed("draft", "dibatalkan")).toBe(true)
    expect(isChangeOrderTransitionAllowed("menunggu_pelanggan", "dibatalkan")).toBe(true)
  })

  it("AC-CO-9 falsifikasi: menunggu_pelanggan -> diterapkan ditolak (lewati disetujui)", () => {
    expect(isChangeOrderTransitionAllowed("menunggu_pelanggan", "diterapkan")).toBe(false)
    expect(() => assertChangeOrderTransition("draft", "diterapkan")).toThrow(/tidak diizinkan/)
    expect(() => assertChangeOrderTransition("diterapkan", "draft")).toThrow(/tidak diizinkan/)
    expect(() => assertChangeOrderTransition("ditolak", "disetujui")).toThrow(/tidak diizinkan/)
  })
})

describe("job-change-order builder — penjaga WO (Q-CO-1/BR-CO-10)", () => {
  it("pending/in_progress/completed lolos", () => {
    for (const s of ["pending", "in_progress", "completed"]) {
      expect(() =>
        assertWorkOrderEligibleForChangeOrder({ workOrderStatus: s, quotationId: 9 }),
      ).not.toThrow()
    }
  })

  it("draft/closed/cancelled ditolak", () => {
    for (const s of ["draft", "closed", "cancelled"]) {
      expect(() =>
        assertWorkOrderEligibleForChangeOrder({ workOrderStatus: s, quotationId: 9 }),
      ).toThrow(/pending, in_progress, atau completed/)
    }
  })

  it("WO tanpa quotationId ditolak (BR-CO-10)", () => {
    expect(() =>
      assertWorkOrderEligibleForChangeOrder({ workOrderStatus: "in_progress", quotationId: null }),
    ).toThrow(/BR-CO-10/)
  })
})

describe("job-change-order builder — kunci baris ter-issue (BR-CO-03)", () => {
  const woItems = [
    { id: 11, itemId: 101 },
    { id: 12, itemId: 102 },
    { id: 13, itemId: 103 },
  ]

  it("workOrderItemId terisi mengunci baris itu", () => {
    const locked = computeLockedWorkOrderItemIds({
      workOrderItems: woItems,
      issuedItems: [{ workOrderItemId: 12, itemId: 102 }],
    })
    expect([...locked]).toEqual([12])
  })

  it("issue legacy workOrderItemId null dikaitkan per itemId ke baris pertama", () => {
    const locked = computeLockedWorkOrderItemIds({
      workOrderItems: woItems,
      issuedItems: [{ workOrderItemId: null, itemId: 103 }],
    })
    expect([...locked]).toEqual([13])
  })

  it("AC-CO-3 falsifikasi: ubah baris terkunci ditolak", () => {
    const locked = computeLockedWorkOrderItemIds({
      workOrderItems: woItems,
      issuedItems: [{ workOrderItemId: 11, itemId: 101 }],
    })
    expect(() =>
      assertLinesNotLocked(
        [{ action: "ubah", workOrderItemId: 11, itemId: 101, qtyAfter: 2 }],
        locked,
      ),
    ).toThrow(/terkunci/)
    // baris bebas lolos
    expect(() =>
      assertLinesNotLocked(
        [{ action: "ubah", workOrderItemId: 12, itemId: 102, qtyAfter: 2 }],
        locked,
      ),
    ).not.toThrow()
  })
})

describe("job-change-order builder — pencocokan quotation deterministik", () => {
  const lines = [
    { id: 1, itemId: 101, unitPrice: 50000, description: "Winch 4.5t" },
    { id: 2, itemId: 101, unitPrice: 75000, description: "Winch 6t" },
    { id: 3, itemId: 102, unitPrice: 10000, description: null },
  ]

  it("cocok unik per itemId+unitPrice+description", () => {
    const r = resolveQuotationItemForChange(lines, {
      itemId: 101,
      unitPriceBefore: 50000,
      description: "Winch 4.5t",
    })
    expect(r.item?.id).toBe(1)
    expect(r.ambiguous).toBe(false)
  })

  it("ambigu = konflik eksplisit, bukan tebakan", () => {
    const dup = [
      { id: 1, itemId: 101, unitPrice: 50000, description: "Sama" },
      { id: 2, itemId: 101, unitPrice: 50000, description: "Sama" },
    ]
    const r = resolveQuotationItemForChange(dup, {
      itemId: 101,
      unitPriceBefore: 50000,
      description: "Sama",
    })
    expect(r.item).toBeNull()
    expect(r.ambiguous).toBe(true)
  })

  it("nol kandidat = null tanpa ambigu", () => {
    const r = resolveQuotationItemForChange(lines, {
      itemId: 999,
      unitPriceBefore: 1,
      description: null,
    })
    expect(r.item).toBeNull()
    expect(r.ambiguous).toBe(false)
  })
})

describe("job-change-order builder — selisih + nomor (BR-CO-01/06)", () => {
  it("selisih tambah/ubah/hapus", () => {
    const selisih = computeChangeOrderSelisih([
      { action: "tambah", workOrderItemId: null, itemId: 201, qtyAfter: 2, unitPriceAfter: 1000 },
      {
        action: "ubah",
        workOrderItemId: 11,
        itemId: 101,
        qtyBefore: 1,
        unitPriceBefore: 5000,
        qtyAfter: 3,
        unitPriceAfter: 5000,
      },
      {
        action: "hapus",
        workOrderItemId: 12,
        itemId: 102,
        qtyBefore: 1,
        unitPriceBefore: 2000,
      },
    ])
    // 2000 + (15000-5000) - 2000 = 10000
    expect(selisih).toBe(10000)
  })

  it("nomor urut per WO monoton format CO-00N", () => {
    expect(formatChangeOrderDocumentNo("001/WO/ISF/10/2026", 1)).toBe("001/WO/ISF/10/2026-CO-001")
    expect(formatChangeOrderDocumentNo("WO-7", 12)).toBe("WO-7-CO-012")
  })
})
