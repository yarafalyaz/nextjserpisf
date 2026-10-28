import { describe, expect, it } from "vitest"

import {
  buildPurchaseProcessHistory,
  purchaseProcessSummary,
  type PurchaseProcessLine,
} from "@/lib/reports/purchase-process-history"

function line(overrides: Partial<PurchaseProcessLine> = {}): PurchaseProcessLine {
  return {
    orderNo: "PO-001",
    date: new Date("2026-10-05T00:00:00Z"),
    vendorName: "PT Sumber Jaya",
    status: "confirmed",
    requestNo: "PR-001",
    receiptCount: 1,
    billCount: 1,
    billed: 2_000_000,
    paid: 1_200_000,
    ...overrides,
  }
}

function notices(result: ReturnType<typeof buildPurchaseProcessHistory>) {
  return result.table.rows.filter((row) => row.kind === "notice").map((row) => (row.kind === "notice" ? row.text : ""))
}

describe("buildPurchaseProcessHistory", () => {
  it("menjumlahkan nilai ditagih, dibayar, dan sisa pesanan", () => {
    const result = buildPurchaseProcessHistory([
      line({ orderNo: "PO-001", billed: 2_000_000, paid: 1_200_000 }),
      line({ orderNo: "PO-002", billed: 1_000_000, paid: 1_000_000 }),
    ])

    expect(result.totals.orders).toBe(2)
    expect(result.totals.billed).toBe(3_000_000)
    expect(result.totals.paid).toBe(2_200_000)
    expect(result.totals.outstanding).toBe(800_000)
  })

  it("menandai pesanan diterima tetapi belum ditagih", () => {
    const result = buildPurchaseProcessHistory([
      line({ orderNo: "PO-001", receiptCount: 1, billCount: 0, billed: 0, paid: 0 }),
      line({ orderNo: "PO-002", receiptCount: 1, billCount: 1 }),
    ])

    expect(result.totals.receivedNotBilled).toBe(1)
    expect(notices(result).join(" ")).toContain("belum ditagih")
  })

  it("menandai tagihan yang belum dibayar penuh", () => {
    const result = buildPurchaseProcessHistory([
      line({ orderNo: "PO-001", billed: 2_000_000, paid: 1_200_000 }),
      line({ orderNo: "PO-002", billed: 1_000_000, paid: 1_000_000 }),
    ])

    expect(result.totals.billedUnpaid).toBe(1)
    expect(notices(result).join(" ")).toContain("belum dibayar penuh")
  })

  // FIN-BR-006: satu toleransi lunas Rp1 (sisi hutang, paritas dengan vonis
  // F-2026-10-28-130-V). Sisa ≤ Rp1 = pembulatan, bukan kekurangan bayar.
  it("menghitung sisa dalam toleransi Rp1 sebagai lunas, bukan belum dibayar", () => {
    const result = buildPurchaseProcessHistory([
      line({ orderNo: "PO-001", billed: 2_000_000, paid: 1_999_999.5 }),
      line({ orderNo: "PO-002", billed: 2_000_000, paid: 1_999_999 }),
    ])

    expect(result.totals.billedUnpaid).toBe(0)
    expect(result.totals.outstanding).toBe(1.5)
  })

  it("tetap menandai sisa di atas toleransi Rp1 sebagai belum dibayar", () => {
    const result = buildPurchaseProcessHistory([
      line({ orderNo: "PO-001", billed: 2_000_000, paid: 1_999_998.99 }),
    ])

    expect(result.totals.billedUnpaid).toBe(1)
  })

  it("tidak menandai tagihan tanpa sisa sebagai belum dibayar", () => {
    const result = buildPurchaseProcessHistory([
      line({ orderNo: "PO-001", billed: 1_000_000, paid: 1_000_000 }),
    ])

    expect(result.totals.billedUnpaid).toBe(0)
  })

  it("membedakan 'tidak ada pesanan' dari daftar kosong biasa", () => {
    const result = buildPurchaseProcessHistory([])

    expect(result.verdict).toContain("Tidak ada pesanan pembelian")
    expect(purchaseProcessSummary(result)).toContain("Tidak ada pesanan pembelian")
  })

  it("menampilkan '—' saat pesanan tidak berasal dari permintaan", () => {
    const result = buildPurchaseProcessHistory([line({ requestNo: null })])
    const data = result.table.rows.find((row) => row.kind === "data")

    expect(data && data.kind === "data" ? data.cells[3] : null).toBe("—")
  })
})
