import { describe, expect, it } from "vitest"

import { buildVatInvoiceList, vatInvoiceSummary, type VatInvoiceInput } from "@/lib/reports/vat-invoices"

function invoice(overrides: Partial<VatInvoiceInput> = {}): VatInvoiceInput {
  return {
    date: new Date(2026, 9, 5),
    documentNo: "INV-001",
    counterparty: "PT Pelanggan",
    dpp: 10_000_000,
    vat: 1_100_000,
    total: 11_100_000,
    ...overrides,
  }
}

function texts(result: ReturnType<typeof buildVatInvoiceList>) {
  return result.table.rows
    .map((row) =>
      row.kind === "notice"
        ? row.text
        : row.kind === "group"
          ? row.label
          : row.kind === "total"
            ? `${row.label} ${row.cells.join(" | ")}`
            : row.cells.join(" | "),
    )
    .join("\n")
}

describe("buildVatInvoiceList", () => {
  it("mengelompokkan faktur penjualan sebagai keluaran dan pembelian sebagai masukan", () => {
    const result = buildVatInvoiceList({
      output: [invoice()],
      input: [invoice({ documentNo: "BILL-001", counterparty: "PT Pemasok", vat: 550_000 })],
    })

    expect(result.output.count).toBe(1)
    expect(result.input.count).toBe(1)
    expect(texts(result)).toContain("PPN Keluaran — Faktur Penjualan (1)")
    expect(texts(result)).toContain("PPN Masukan — Faktur Pembelian (1)")
    expect(texts(result)).toContain("INV-001")
    expect(texts(result)).toContain("BILL-001")
  })

  it("menjumlahkan DPP, PPN, dan total tiap sisi", () => {
    const result = buildVatInvoiceList({
      output: [invoice({ vat: 1_100_000 }), invoice({ documentNo: "INV-002", vat: 2_200_000 })],
      input: [],
    })

    expect(result.output.vat).toBe(3_300_000)
    expect(result.output.count).toBe(2)
  })

  it("menghitung posisi = PPN keluaran − masukan", () => {
    const kurang = buildVatInvoiceList({ output: [invoice({ vat: 1_100_000 })], input: [invoice({ vat: 400_000 })] })
    const lebih = buildVatInvoiceList({ output: [invoice({ vat: 400_000 })], input: [invoice({ vat: 1_100_000 })] })

    expect(kurang.netVat).toBe(700_000)
    expect(lebih.netVat).toBe(-700_000)
    expect(vatInvoiceSummary(kurang)).toContain("kurang bayar")
    expect(vatInvoiceSummary(lebih)).toContain("lebih bayar")
  })

  it("menyatakan bila tidak ada faktur ber-PPN pada periode ini", () => {
    const result = buildVatInvoiceList({ output: [], input: [] })

    expect(result.output.count).toBe(0)
    expect(result.input.count).toBe(0)
    expect(texts(result)).toContain("Tidak ada faktur penjualan ber-PPN")
    expect(texts(result)).toContain("Tidak ada faktur pembelian ber-PPN")
    expect(vatInvoiceSummary(result)).toContain("Tidak ada faktur ber-PPN")
  })

  it("mengurutkan faktur menurut tanggal", () => {
    const result = buildVatInvoiceList({
      output: [
        invoice({ date: new Date(2026, 9, 20), documentNo: "AKHIR" }),
        invoice({ date: new Date(2026, 9, 2), documentNo: "AWAL" }),
      ],
      input: [],
    })
    const urutan = result.table.rows
      .filter((row) => row.kind === "data")
      .map((row) => (row.kind === "data" ? row.cells[1] : ""))

    expect(urutan[0]).toBe("AWAL")
    expect(urutan[1]).toBe("AKHIR")
  })

  it("menyatakan bahwa nomor faktur pajak e-Faktur belum disimpan", () => {
    const result = buildVatInvoiceList({ output: [invoice()], input: [] })

    expect(texts(result)).toContain("e-Faktur")
  })
})
