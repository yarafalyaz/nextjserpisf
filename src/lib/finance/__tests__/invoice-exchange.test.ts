import { describe, expect, it } from "vitest"

import {
  buildInvoiceExchangeListing,
  invoiceExchangeSummary,
  settlementStatus,
  type ExchangeReportLine,
} from "@/lib/finance/invoice-exchange"

function line(overrides: Partial<ExchangeReportLine> = {}): ExchangeReportLine {
  return {
    date: new Date("2026-10-05T00:00:00"),
    documentNo: "TKF-0001",
    customerName: "Toko Merdeka",
    receiptNumber: "TT-01",
    dueDate: new Date("2026-11-05T00:00:00"),
    invoiceCount: 2,
    amount: 10_000_000,
    paid: 0,
    ...overrides,
  }
}

describe("settlementStatus", () => {
  it("membedakan belum dibayar, sebagian, dan lunas", () => {
    expect(settlementStatus(1_000_000, 0)).toBe("outstanding")
    expect(settlementStatus(1_000_000, 400_000)).toBe("partial")
    expect(settlementStatus(1_000_000, 1_000_000)).toBe("settled")
  })

  it("menganggap lunas bila selisihnya hanya pembulatan di bawah setengah sen", () => {
    expect(settlementStatus(1_000_000, 999_999.997)).toBe("settled")
  })
})

describe("buildInvoiceExchangeListing", () => {
  it("menghitung nilai, dibayar, dan sisa dari faktur", () => {
    const result = buildInvoiceExchangeListing([line({ amount: 10_000_000, paid: 4_000_000 })])

    expect(result.totals.amount).toBe(10_000_000)
    expect(result.totals.paid).toBe(4_000_000)
    expect(result.totals.outstanding).toBe(6_000_000)
    expect(result.totals.partial).toBe(1)
  })

  it("menghitung jumlah dokumen per status pelunasan", () => {
    const result = buildInvoiceExchangeListing([
      line({ documentNo: "A", amount: 1_000_000, paid: 1_000_000 }),
      line({ documentNo: "B", amount: 1_000_000, paid: 500_000 }),
      line({ documentNo: "C", amount: 1_000_000, paid: 0 }),
    ])

    expect(result.totals.settled).toBe(1)
    expect(result.totals.partial).toBe(1)
    expect(result.totals.outstandingDocs).toBe(1)
    expect(invoiceExchangeSummary(result)).toContain("1 belum dibayar")
  })

  it("menegaskan status dihitung dari faktur dan dokumen ini tanpa jurnal", () => {
    const result = buildInvoiceExchangeListing([line()])
    const notice = result.table.rows.find((row) => row.kind === "notice")

    expect(notice && notice.kind === "notice" ? notice.text : "").toContain("tidak membuat jurnal")
  })

  it("menampilkan '—' bila tanda terima / jatuh tempo kosong", () => {
    const result = buildInvoiceExchangeListing([line({ receiptNumber: null, dueDate: null })])
    const data = result.table.rows.find((row) => row.kind === "data")

    expect(data && data.kind === "data" ? data.cells[3] : null).toBe("—")
    expect(data && data.kind === "data" ? data.cells[4] : null).toBe("—")
  })

  it("membedakan 'tidak ada tukar faktur' dari daftar kosong", () => {
    const result = buildInvoiceExchangeListing([])

    expect(result.verdict).toContain("Tidak ada tukar faktur")
    expect(invoiceExchangeSummary(result)).toContain("Tidak ada tukar faktur")
  })
})

describe("paritas FIN-BR-006 — satu sumber kebenaran status lunas", () => {
  it("sisa 0,50 di dalam toleransi Rp1 dinyatakan lunas, sama seperti layar faktur", () => {
    // FIN-BR-006: toleransi pembulatan pembayaran = Rp1 (SETTLEMENT_TOLERANCE_IDR).
    // Sebelum paritas ini, laporan tukar faktur memakai ambang setengah sen
    // (0,005) sehingga faktur yang sudah "Lunas" di layar faktur tampil
    // "Sebagian" di sini — dua status untuk satu dokumen yang sama.
    expect(settlementStatus(1_000_000, 999_999.5)).toBe("settled")
    expect(settlementStatus(999_999.5, 999_999)).toBe("settled")
  })

  it("sisa 1,01 di luar toleransi tetap sebagian", () => {
    expect(settlementStatus(1_000_000, 999_998.99)).toBe("partial")
  })

  it("dokumen bernilai nol tidak pernah dinyatakan lunas", () => {
    expect(settlementStatus(0, 0)).toBe("outstanding")
  })

  it("hitungan lunas/sebagian laporan memakai toleransi kanonis", () => {
    const result = buildInvoiceExchangeListing([
      line({ documentNo: "A", amount: 1_000_000, paid: 999_999.5 }),
      line({ documentNo: "B", amount: 1_000_000, paid: 500_000 }),
      line({ documentNo: "C", amount: 1_000_000, paid: 0 }),
    ])

    expect(result.totals.settled).toBe(1)
    expect(result.totals.partial).toBe(1)
    expect(result.totals.outstandingDocs).toBe(1)
    const rowA = result.table.rows.find((row) => row.kind === "data" && row.cells[1] === "A")
    expect(rowA && rowA.kind === "data" ? rowA.cells[9] : null).toBe("Lunas")
  })
})

describe("buildInvoiceExchangeListing presisi sen", () => {
  it("total 7 baris bersen eksak, sisa = ditagih - dibayar", () => {
    const lines = Array.from({ length: 7 }, (_, i) =>
      line({ documentNo: `TKF-${i}`, amount: 1_234_567.89, paid: 123_456.78 }),
    )
    const result = buildInvoiceExchangeListing(lines)
    expect(result.totals.amount).toBe(8_641_975.23)
    expect(result.totals.paid).toBe(864_197.46)
    expect(result.totals.outstanding).toBe(7_777_777.77)
  })
})
