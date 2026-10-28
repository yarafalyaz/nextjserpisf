import { describe, expect, it } from "vitest"

import {
  buildSalesProcessHistory,
  salesProcessSummary,
  type SalesProcessLine,
} from "@/lib/reports/sales-process-history"

function line(overrides: Partial<SalesProcessLine> = {}): SalesProcessLine {
  return {
    orderNo: "SO-001",
    date: new Date("2026-10-05T00:00:00Z"),
    customerName: "Toko Merdeka",
    status: "confirmed",
    deliveryCount: 1,
    invoiceCount: 1,
    invoiced: 1_000_000,
    paid: 400_000,
    ...overrides,
  }
}

function notices(result: ReturnType<typeof buildSalesProcessHistory>) {
  return result.table.rows.filter((row) => row.kind === "notice").map((row) => (row.kind === "notice" ? row.text : ""))
}

describe("buildSalesProcessHistory", () => {
  it("menjumlahkan nilai ditagih, dibayar, dan sisa pesanan", () => {
    const result = buildSalesProcessHistory([
      line({ orderNo: "SO-001", invoiced: 1_000_000, paid: 400_000 }),
      line({ orderNo: "SO-002", invoiced: 500_000, paid: 500_000 }),
    ])

    expect(result.totals.orders).toBe(2)
    expect(result.totals.invoiced).toBe(1_500_000)
    expect(result.totals.paid).toBe(900_000)
    expect(result.totals.outstanding).toBe(600_000)
  })

  it("menandai pesanan terkirim tetapi belum difakturkan", () => {
    const result = buildSalesProcessHistory([
      line({ orderNo: "SO-001", deliveryCount: 2, invoiceCount: 0, invoiced: 0, paid: 0 }),
      line({ orderNo: "SO-002", deliveryCount: 1, invoiceCount: 1 }),
    ])

    expect(result.totals.deliveredNotInvoiced).toBe(1)
    expect(notices(result).join(" ")).toContain("sudah dikirim")
  })

  it("menandai faktur yang belum dibayar penuh", () => {
    const result = buildSalesProcessHistory([
      line({ orderNo: "SO-001", invoiced: 1_000_000, paid: 400_000 }),
      line({ orderNo: "SO-002", invoiced: 500_000, paid: 500_000 }),
    ])

    expect(result.totals.invoicedUnpaid).toBe(1)
    expect(notices(result).join(" ")).toContain("belum dibayar penuh")
  })

  // FIN-BR-006: satu toleransi lunas Rp1. Sisa 0,01–1,00 adalah pembulatan
  // pembayaran rupiah penuh, bukan kekurangan bayar — jadi TIDAK boleh
  // dihitung sebagai "belum dibayar" di laporan proses.
  it("menghitung sisa dalam toleransi Rp1 sebagai lunas, bukan belum dibayar", () => {
    const result = buildSalesProcessHistory([
      line({ orderNo: "SO-001", invoiced: 1_000_000, paid: 999_999.5 }),
      line({ orderNo: "SO-002", invoiced: 1_000_000, paid: 999_999 }),
    ])

    expect(result.totals.invoicedUnpaid).toBe(0)
    expect(result.totals.outstanding).toBe(1.5)
  })

  it("tetap menandai sisa di atas toleransi Rp1 sebagai belum dibayar", () => {
    const result = buildSalesProcessHistory([
      line({ orderNo: "SO-001", invoiced: 1_000_000, paid: 999_998.99 }),
    ])

    expect(result.totals.invoicedUnpaid).toBe(1)
  })

  it("tidak menandai pesanan tanpa sisa sebagai belum dibayar", () => {
    const result = buildSalesProcessHistory([
      line({ orderNo: "SO-001", invoiced: 500_000, paid: 500_000 }),
    ])

    expect(result.totals.invoicedUnpaid).toBe(0)
  })

  it("membedakan 'tidak ada pesanan' dari daftar kosong biasa", () => {
    const result = buildSalesProcessHistory([])

    expect(result.verdict).toContain("Tidak ada pesanan penjualan")
    expect(notices(result).join(" ")).toContain("Tidak ada pesanan penjualan pada periode ini")
    expect(salesProcessSummary(result)).toContain("Tidak ada pesanan penjualan")
  })

  it("menyertakan baris jumlah saat ada pesanan", () => {
    const result = buildSalesProcessHistory([line()])
    const grand = result.table.rows.find((row) => row.kind === "total" && row.grand === true)

    expect(grand).toBeTruthy()
    expect(salesProcessSummary(result)).toContain("pesanan")
  })
})
