import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    vendorBill: { findMany: vi.fn() },
    salesPayment: { findMany: vi.fn() },
    withholdingCertificate: { findMany: vi.fn() },
  },
}))

import { prisma } from "@/lib/db/prisma"
import {
  buildWithholdingCertificateTable,
  purchaseDpp,
  serializeWithholdingCertificatesCsv,
  type WithholdingCertificateInput,
} from "../withholding-certificates"
import {
  loadWithholdingCertificateInputs,
  loadWithholdingCertificatesCsv,
} from "../withholding-certificates-data"

const vb = vi.mocked(prisma.vendorBill.findMany)
const sp = vi.mocked(prisma.salesPayment.findMany)
const wc = vi.mocked(prisma.withholdingCertificate.findMany)

function row(overrides: Partial<WithholdingCertificateInput>): WithholdingCertificateInput {
  return {
    side: "purchase",
    date: new Date(2026, 0, 15),
    certificateNo: null,
    documentNo: "VB-001",
    counterparty: "PT Maklon",
    npwp: "01.234.567.8-091.000",
    typeCode: "PPh 23",
    typeName: "Jasa",
    rate: 2,
    dpp: 1000,
    withheld: 20,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  wc.mockResolvedValue([] as never)
})

describe("serializeWithholdingCertificatesCsv (F-35a)", () => {
  it("kolom backlog lengkap + NPWP + total dua sisi terpisah sen persis", () => {
    const rows = Array.from({ length: 17 }, (_, i) =>
      row({ documentNo: `VB-${String(i + 1).padStart(3, "0")}`, dpp: 12, withheld: 0.24 }),
    )
    rows.push(row({ side: "sales", documentNo: "SP-001", certificateNo: "BP-001", dpp: null, withheld: 50 }))
    const out = serializeWithholdingCertificatesCsv(rows)
    expect(out.csv).toContain('"No. Bukti Potong"')
    expect(out.csv).toContain('"NPWP"')
    expect(out.csv).toContain("01.234.567.8-091.000")
    expect(out.csv).toContain('"BP-001"')
    expect(out.purchaseCount).toBe(17)
    expect(out.salesCount).toBe(1)
    expect(out.purchaseWithheld).toBe(4.08)
    expect(out.salesWithheld).toBe(50)
  })

  it("DPP penjualan kosong (tak tersimpan), bukan dihitung dari tarif", () => {
    const out = serializeWithholdingCertificatesCsv([
      row({ side: "sales", documentNo: "SP-001", dpp: null, withheld: 20 }),
    ])
    const line = out.csv.split("\n").find((l) => l.includes("SP-001")) ?? ""
    expect(line).toContain('"Penjualan"')
    expect(line.split(",").map((c) => c.replace(/"/g, ""))).toContain("")
    expect(out.salesWithheld).toBe(20)
  })

  it("purchaseDpp = subtotal − diskon presisi sen", () => {
    expect(purchaseDpp(100.1, 0.02)).toBe(100.08)
    expect(purchaseDpp(100, null)).toBe(100)
  })

  it("escaping CSV: koma/kutip dalam nama lawan aman", () => {
    const out = serializeWithholdingCertificatesCsv([row({ counterparty: 'PT "A", B' })])
    expect(out.csv).toContain('"PT ""A"", B"')
  })
})

describe("loadWithholdingCertificatesCsv (F-35a)", () => {
  it("loader memetakan NPWP vendor + customer dan DPP pembelian", async () => {
    vb.mockResolvedValue([{
      date: new Date(2026, 0, 10), documentNo: "VB-001", subtotal: 1000, discountAmount: 100,
      withholdingAmount: 18,
      vendor: { name: "PT Maklon", npwp: "02.111" },
      withholdingType: { code: "PPh 23", name: "Jasa", rate: 2 },
    }] as never)
    sp.mockResolvedValue([{
      paymentDate: new Date(2026, 0, 11), documentNo: "SP-001", withholdingCertificateNo: "BP-9",
      withholdingAmount: 30,
      salesInvoice: { customer: { name: "PT Klien", taxId: "03.222" } },
      withholdingType: { code: "PPh 23", name: "Jasa", rate: 2 },
    }] as never)

    const out = await loadWithholdingCertificatesCsv({ start: new Date(2026, 0, 1), end: new Date(2026, 0, 31) })
    expect(out.csv).toContain("02.111")
    expect(out.csv).toContain("03.222")
    expect(out.csv).toContain('"900.00"')
    expect(out.purchaseWithheld).toBe(18)
    expect(out.salesWithheld).toBe(30)
    expect(vb).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ withholdingAmount: { gt: 0 } }),
    }))
  })

  // B8: satu loader bersama — input yang sama membentuk tabel layar/PDF
  // dan CSV, jadi total kedua sisi ketiga permukaan selalu sama. Versi
  // lama: layar dua sisi, PDF hanya vendor, CSV semesta ketiga.
  it("B8: total tabel (layar/PDF) = total CSV dari input yang sama, dua sisi", () => {
    const inputs: WithholdingCertificateInput[] = [
      row({ documentNo: "VB-001", withheld: 20, dpp: 1000 }),
      row({ documentNo: "VB-002", withheld: 30, dpp: 1500 }),
      row({ side: "sales", documentNo: "SP-001", certificateNo: "BP-001", dpp: null, withheld: 50 }),
    ]
    const table = buildWithholdingCertificateTable(inputs)
    const csv = serializeWithholdingCertificatesCsv(inputs)
    expect(table.purchaseWithheld).toBe(csv.purchaseWithheld)
    expect(table.salesWithheld).toBe(csv.salesWithheld)
    expect(table.purchaseWithheld).toBe(50)
    expect(table.salesWithheld).toBe(50)
    // Kedua sisi tampil sebagai kelompok terpisah di tabel.
    const groups = table.rows.filter((r) => r.kind === "group").map((r) => (r.kind === "group" ? r.label : ""))
    expect(groups.some((g) => g.includes("Pembelian"))).toBe(true)
    expect(groups.some((g) => g.includes("Penjualan"))).toBe(true)
  })

  it("B8: loader inputs membawa nomor faktur penjualan untuk kolom Faktur layar", async () => {
    vb.mockResolvedValue([] as never)
    sp.mockResolvedValue([{
      paymentDate: new Date(2026, 0, 11), documentNo: "SP-001", withholdingCertificateNo: "BP-9",
      withholdingAmount: 30,
      salesInvoice: { documentNo: "INV-77", customer: { name: "PT Klien", taxId: "03.222" } },
      withholdingType: { code: "PPh 23", name: "Jasa", rate: 2 },
    }] as never)

    const inputs = await loadWithholdingCertificateInputs({ start: new Date(2026, 0, 1), end: new Date(2026, 0, 31) })
    expect(inputs).toHaveLength(1)
    expect(inputs[0].side).toBe("sales")
    expect(inputs[0].invoiceNo).toBe("INV-77")
  })

  it("F-003: bupot snapshot menggantikan baris fallback tagihan tertaut (tanpa dobel)", async () => {
    vb.mockResolvedValue([{
      id: 5, date: new Date(2026, 0, 10), documentNo: "VB-001", subtotal: 1000, discountAmount: 100,
      withholdingAmount: 18,
      vendor: { name: "PT Maklon", npwp: "02.111" },
      withholdingType: { code: "PPh 23", name: "Jasa", rate: 2 },
    }] as never)
    sp.mockResolvedValue([] as never)
    wc.mockResolvedValue([{
      direction: "we_withhold", certificateNumber: "BP-77", withholdingDate: new Date(2026, 0, 12),
      counterpartyName: "PT Maklon", counterpartyTaxId: "02.111",
      article: "PPh23", objectCode: "24-104-01", dpp: 900, tariff: 2, withheldAmount: 18,
      vendorBillId: 5, salesPaymentId: null,
      withholdingType: { code: "PPh 23", name: "Jasa" },
      vendorBill: { documentNo: "VB-001" }, salesPayment: null,
    }] as never)

    const out = await loadWithholdingCertificatesCsv({ start: new Date(2026, 0, 1), end: new Date(2026, 0, 31) })
    expect(out.purchaseCount).toBe(1)
    expect(out.csv).toContain('"BP-77"')
    expect(out.csv).toContain("24-104-01")
    expect(out.purchaseWithheld).toBe(18)
  })
})
