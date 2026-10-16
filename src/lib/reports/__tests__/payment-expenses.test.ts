import { describe, expect, it } from "vitest"

import { buildPaymentExpenses, type PaymentExpenseInput } from "@/lib/reports/payment-expenses"

const period = { start: new Date("2026-10-01T00:00:00"), end: new Date("2026-10-31T23:59:59") }

function expense(over: Partial<PaymentExpenseInput> = {}): PaymentExpenseInput {
  return {
    date: new Date("2026-10-05T00:00:00"),
    documentNo: "VP-0001",
    source: "Pembayaran Vendor",
    counterparty: "CV Sumber",
    adminFee: 1_000,
    ...over,
  }
}

describe("buildPaymentExpenses", () => {
  it("mengelompokkan per asal biaya dengan subtotal dan jumlah akhir", () => {
    const result = buildPaymentExpenses({
      expenses: [
        expense(),
        expense({ documentNo: "VP-0002", adminFee: 2_500 }),
        expense({
          documentNo: "GR-0001",
          source: "Penerimaan Barang",
          counterparty: "Toko Online",
          adminFee: 4_000,
        }),
      ],
      start: period.start,
      end: period.end,
    })

    const groups = result.table.rows.filter((row) => row.kind === "group").map((row) => String(row.label))
    expect(groups).toEqual(["Pembayaran Vendor", "Penerimaan Barang"])

    const totals = result.table.rows.filter((row) => row.kind === "total")
    expect(String(totals[0].label)).toBe("Jumlah Pembayaran Vendor")
    expect(totals[0].cells?.[4]).toBe("3.500")
    expect(String(totals[1].label)).toBe("Jumlah Penerimaan Barang")
    expect(totals[1].cells?.[4]).toBe("4.000")
    expect(totals[2].grand).toBe(true)
    expect(totals[2].cells?.[4]).toBe("7.500")

    expect(result.bySource).toEqual([
      { source: "Pembayaran Vendor", count: 2, adminFee: 3_500 },
      { source: "Penerimaan Barang", count: 1, adminFee: 4_000 },
    ])
    expect(result.totals).toEqual({ count: 3, adminFee: 7_500 })
  })

  it("mengabaikan baris tanpa beban (0) — bukan beban, tidak masuk laporan", () => {
    const result = buildPaymentExpenses({
      expenses: [expense(), expense({ documentNo: "VP-0002", adminFee: 0 })],
      start: period.start,
      end: period.end,
    })

    expect(result.totals.count).toBe(1)
    const data = result.table.rows.filter((row) => row.kind === "data")
    expect(data).toHaveLength(1)
  })

  it("mengabaikan dokumen di luar periode", () => {
    const result = buildPaymentExpenses({
      expenses: [expense({ date: new Date("2026-09-30T00:00:00") })],
      start: period.start,
      end: period.end,
    })
    expect(result.totals.count).toBe(0)
    expect(result.bySource).toEqual([])
  })

  it("periode tanpa beban menghasilkan catatan, bukan tabel kosong tanpa penjelasan", () => {
    const result = buildPaymentExpenses({ expenses: [], start: period.start, end: period.end })
    const notices = result.table.rows.filter((row) => row.kind === "notice").map((row) => String(row.text))
    expect(notices.some((text) => text.includes("Tidak ada beban bank/administrasi"))).toBe(true)
  })

  it("menampilkan tanggal, dokumen, asal, lawan transaksi, dan nilai beban", () => {
    const result = buildPaymentExpenses({
      expenses: [
        expense({ documentNo: "GR-0007", source: "Penerimaan Barang", counterparty: null, adminFee: 1_500 }),
      ],
      start: period.start,
      end: period.end,
    })

    const row = result.table.rows.find((row) => row.kind === "data")
    expect(row?.cells).toEqual(["05 Okt 2026", "GR-0007", "Penerimaan Barang", "–", "1.500"])
  })
})
