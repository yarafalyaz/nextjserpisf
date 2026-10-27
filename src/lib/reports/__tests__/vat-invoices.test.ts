import { describe, expect, it } from "vitest"

import { buildVatInvoiceList, computeReturnDeduction, displayNpwp, displayTaxInvoiceNo, vatInvoiceSummary, type VatInvoiceInput } from "@/lib/reports/vat-invoices"

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

  it("menampilkan nomor faktur pajak di kolomnya sendiri bila tercatat", () => {
    const result = buildVatInvoiceList({
      output: [invoice({ taxInvoiceNumber: "010.000-26.12345678" })],
      input: [invoice({ documentNo: "BILL-001", counterparty: "PT Pemasok", taxInvoiceNumber: "010.000-26.87654321" })],
    })

    expect(result.table.columns.map((c) => c.header)).toContain("Nomor Faktur Pajak")
    expect(texts(result)).toContain("010.000-26.12345678")
    expect(texts(result)).toContain("010.000-26.87654321")
    expect(result.missingTaxInvoiceCount).toBe(0)
    expect(texts(result)).not.toContain("belum punya nomor faktur pajak")
  })

  it("kembali ke nomor dokumen internal bila nomor faktur pajak kosong", () => {
    const result = buildVatInvoiceList({
      output: [invoice(), invoice({ documentNo: "INV-002", taxInvoiceNumber: "  " })],
      input: [],
    })
    const data = result.table.rows.filter((row) => row.kind === "data")

    // Kolom: [tanggal, nomor dokumen, nomor faktur pajak, pihak, ...]
    expect(data.map((row) => (row.kind === "data" ? row.cells[2] : ""))).toEqual(["INV-001", "INV-002"])
    expect(result.missingTaxInvoiceCount).toBe(2)
    expect(texts(result)).toContain("2 faktur belum punya nomor faktur pajak")
    expect(result.verdict).toContain("2 tanpa nomor faktur pajak")
  })

  it("faktur tanpa nomor dokumen tampil tanda hubung, angka tetap terhitung", () => {
    const result = buildVatInvoiceList({
      output: [invoice({ documentNo: null }), invoice({ documentNo: "INV-002", date: new Date(2026, 9, 6) })],
      input: [],
    })

    expect(result.output.count).toBe(2)
    expect(result.output.vat).toBe(2_200_000)
    const data = result.table.rows.filter((row) => row.kind === "data")
    expect(data.map((row) => (row.kind === "data" ? row.cells[1] : ""))).toEqual(["–", "INV-002"])
    expect(displayTaxInvoiceNo(invoice({ documentNo: null }))).toBe("–")
    expect(displayTaxInvoiceNo(invoice({ documentNo: null, taxInvoiceNumber: "010.000-26.9" }))).toBe("010.000-26.9")
  })

  it("displayTaxInvoiceNo memprioritaskan nomor faktur pajak, lalu nomor internal", () => {
    expect(displayTaxInvoiceNo(invoice({ taxInvoiceNumber: " 010.000-26.1 " }))).toBe("010.000-26.1")
    expect(displayTaxInvoiceNo(invoice({ taxInvoiceNumber: null }))).toBe("INV-001")
    expect(displayTaxInvoiceNo(invoice())).toBe("INV-001")
  })

  it("menampilkan NPWP lawan di kolomnya sendiri; kosong menjadi tanda hubung", () => {
    const result = buildVatInvoiceList({
      output: [invoice({ npwp: " 01.234.567.8-901.000 " })],
      input: [invoice({ documentNo: "BILL-001", counterparty: "PT Pemasok" })],
    })

    expect(result.table.columns.map((c) => c.header)).toContain("NPWP")
    const data = result.table.rows.filter((row) => row.kind === "data")
    // Kolom: [tanggal, nomor dokumen, nomor faktur pajak, pihak, NPWP, ...]
    expect(data.map((row) => (row.kind === "data" ? row.cells[4] : ""))).toEqual([
      "01.234.567.8-901.000",
      "–",
    ])
    expect(displayNpwp(invoice({ npwp: "  " }))).toBe("–")
    expect(displayNpwp(invoice({ npwp: null }))).toBe("–")
  })

  it("pengurang retur tampil terpisah dan mengurangi posisi PPN, baris asal utuh", () => {
    const result = buildVatInvoiceList({
      output: [invoice()], // keluaran DPP 10jt / PPN 1,1jt
      input: [],
      returnDeductions: [
        { date: new Date(2026, 9, 6), documentNo: "SR-001", sourceDocumentNo: "INV-001", counterparty: "PT Pelanggan", dpp: 5_000_000, vat: 550_000 },
      ],
    })
    expect(result.output.vat).toBe(1_100_000) // baris asal tidak diubah
    expect(result.returnDeduction).toEqual({ count: 1, dpp: 5_000_000, vat: 550_000, total: 5_550_000 })
    expect(result.outputNetVat).toBe(550_000)
    expect(result.netVat).toBe(550_000) // posisi memakai keluaran neto
    expect(texts(result)).toContain("Pengurang Masa Retur — Nota Retur Penjualan (1)")
    expect(texts(result)).toContain("SR-001")
  })

  it("tanpa retur: pengurang nol dan posisi = keluaran", () => {
    const result = buildVatInvoiceList({ output: [invoice()], input: [] })
    expect(result.returnDeduction.count).toBe(0)
    expect(result.outputNetVat).toBe(result.output.vat)
    expect(result.netVat).toBe(result.output.vat)
    expect(texts(result)).not.toContain("Pengurang Masa Retur")
  })

describe("computeReturnDeduction (pengurang masa retur)", () => {
  it("PPN = DPP-retur x tarif efektif faktur asal, dibulatkan sen", () => {
    // Faktur asal DPP 10jt (11jt-1jt diskon), taxAmount 1,1jt -> tarif 11%.
    const r = computeReturnDeduction({
      qty: 2, price: 2_500_000,
      source: { subtotal: 11_000_000, discount: 1_000_000, taxAmount: 1_100_000 },
    })
    expect(r.dpp).toBe(5_000_000)
    expect(r.vat).toBe(550_000)
  })

  it("retur tanpa faktur asal / tanpa PPN asal tidak menghasilkan PPN-retur", () => {
    expect(computeReturnDeduction({ qty: 1, price: 100_000, source: null })).toEqual({ dpp: 100_000, vat: 0 })
    expect(computeReturnDeduction({
      qty: 1, price: 100_000,
      source: { subtotal: 1_000_000, discount: 0, taxAmount: 0 },
    })).toEqual({ dpp: 100_000, vat: 0 })
  })

  it("DPP faktur asal nol tidak melempar dan PPN-retur nol", () => {
    expect(computeReturnDeduction({
      qty: 1, price: 100_000,
      source: { subtotal: 500_000, discount: 500_000, taxAmount: 50_000 },
    })).toEqual({ dpp: 100_000, vat: 0 })
  })
})

  it("memberi peringatan retur tanpa mengubah DPP/PPN/total laporan", () => {
    const result = buildVatInvoiceList({
      output: [
        invoice({
          returnRef: { documentNo: "SR-001", sourceDocumentNo: "INV-001" },
        }),
      ],
      input: [],
    })

    expect(result.returnedInvoiceCount).toBe(1)
    expect(result.output.vat).toBe(1_100_000)
    expect(result.output.total).toBe(11_100_000)
    expect(texts(result)).toContain("retur terproses SR-001")
    expect(texts(result)).toContain("belum mengurangi laporan ini")
    expect(result.verdict).toContain("1 faktur ber-retur")
  })

  it("tanpa retur tidak ada peringatan dan hitungan retur nol", () => {
    const result = buildVatInvoiceList({ output: [invoice()], input: [] })

    expect(result.returnedInvoiceCount).toBe(0)
    expect(texts(result)).not.toContain("retur terproses")
    expect(result.verdict).not.toContain("ber-retur")
  })
})
