import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * PDF Total Hutang memuat TIGA bagian dalam satu tabel (ringkasan umur,
 * hutang per pemasok, rincian tagihan). Header bersama harus netral: dulu
 * kolom bertanggal "Jatuh Tempo" dipakai juga untuk Total Tagihan/Dibayar,
 * sehingga nominal uang tercetak di bawah kolom tanggal pada cetakan & CSV.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: { vendorBill: { findMany: vi.fn() } },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { loadPayablesTotal } from "../aging-reports-data"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.vendorBill.findMany.mockResolvedValue([
    {
      vendorId: 1,
      documentNo: "VB-1",
      dueDate: new Date("2026-10-10T00:00:00Z"),
      grandTotal: 500_000,
      paidAmount: 0,
      withholdingAmount: 0,
      balanceDue: 500_000,
      vendor: { name: "PT B" },
    },
  ])
})

describe("loadPayablesTotal — header tabel cetak", () => {
  it("header tidak lagi memakai judul bertanggal untuk kolom uang", () => {
    return loadPayablesTotal(new Date("2026-10-31")).then((report) => {
      const headers = report.table.columns.map((column) => column.header)
      expect(headers).toEqual([
        "Keterangan / Pemasok",
        "Dokumen / Jumlah",
        "Jatuh Tempo / Umur",
        "Total Tagihan",
        "Dibayar",
        "Sisa",
      ])
      expect(headers).not.toContain("No. Tagihan")
      for (const row of report.table.rows) {
        // Baris total mengikuti konvensi trailing (satu sel, digeser ke kanan).
        if (row.kind === "data") {
          expect(row.cells.length).toBe(report.table.columns.length)
        }
      }
    })
  })

  it("baris hutang per pemasok menaruh uang di kolom uang", async () => {
    const report = await loadPayablesTotal(new Date("2026-10-31"))

    const vendorRow = report.table.rows.find(
      (row) => row.kind === "data" && row.cells[0] === "PT B",
    )
    expect(vendorRow?.kind === "data" ? vendorRow.cells : []).toEqual([
      "PT B",
      "1",
      "",
      "500.000",
      "0",
      "500.000",
    ])
  })
})
