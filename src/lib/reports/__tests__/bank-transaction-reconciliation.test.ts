import { describe, expect, it } from "vitest"

import {
  bankTransactionSummary,
  buildBankTransactionReconciliation,
  type BankTransactionInput,
} from "@/lib/reports/bank-transaction-reconciliation"

function line(overrides: Partial<BankTransactionInput> = {}): BankTransactionInput {
  return {
    date: new Date(2026, 4, 5),
    accountLabel: "110101 Kas",
    description: "Penerimaan pelanggan",
    reference: "TRF-001",
    inflow: 5_000_000,
    outflow: 0,
    reconciled: false,
    ...overrides,
  }
}

function texts(result: ReturnType<typeof buildBankTransactionReconciliation>) {
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

describe("buildBankTransactionReconciliation", () => {
  it("memisahkan baris terekonsiliasi dari yang belum beserta subtotalnya", () => {
    const result = buildBankTransactionReconciliation([
      line({ reference: "TRF-001", reconciled: true, inflow: 5_000_000 }),
      line({ reference: "TRF-002", reconciled: false, inflow: 0, outflow: 3_000_000 }),
    ])

    expect(result.reconciled.count).toBe(1)
    expect(result.reconciled.inflow).toBe(5_000_000)
    expect(result.unreconciled.count).toBe(1)
    expect(result.unreconciled.outflow).toBe(3_000_000)
    expect(texts(result)).toContain("Terekonsiliasi (1)")
    expect(texts(result)).toContain("Belum Terekonsiliasi (1)")
    expect(texts(result)).toContain("TRF-001")
    expect(texts(result)).toContain("TRF-002")
  })

  it("menjumlahkan total sebagai gabungan kedua kelompok", () => {
    const result = buildBankTransactionReconciliation([
      line({ reconciled: true, inflow: 5_000_000 }),
      line({ reconciled: false, inflow: 0, outflow: 3_000_000 }),
    ])

    expect(result.total.count).toBe(2)
    expect(result.total.inflow).toBe(5_000_000)
    expect(result.total.outflow).toBe(3_000_000)
    expect(texts(result)).toContain("Jumlah")
  })

  it("mengurutkan baris menurut tanggal", () => {
    const result = buildBankTransactionReconciliation([
      line({ date: new Date(2026, 4, 20), reference: "LEBIH-AKHIR" }),
      line({ date: new Date(2026, 4, 2), reference: "LEBIH-AWAL" }),
    ])
    const urutan = result.table.rows
      .filter((row) => row.kind === "data")
      .map((row) => (row.kind === "data" ? row.cells[3] : ""))

    expect(urutan[0]).toBe("LEBIH-AWAL")
    expect(urutan[1]).toBe("LEBIH-AKHIR")
  })

  it("menyatakan bila semua baris sudah terekonsiliasi", () => {
    const result = buildBankTransactionReconciliation([line({ reconciled: true })])

    expect(result.unreconciled.count).toBe(0)
    expect(texts(result)).toContain("Semua baris rekening koran")
    expect(result.verdict).toContain("semuanya terekonsiliasi")
  })

  it("membedakan 'tidak ada baris' dari 'semua terekonsiliasi'", () => {
    const kosong = buildBankTransactionReconciliation([])

    expect(kosong.total.count).toBe(0)
    expect(texts(kosong)).toContain("Tidak ada baris rekening koran")
    expect(bankTransactionSummary(kosong)).toContain("Tidak ada transaksi bank")
  })

  it("meringkas untuk KPI saat ada sisa belum terekonsiliasi", () => {
    const result = buildBankTransactionReconciliation([
      line({ reconciled: true, inflow: 5_000_000 }),
      line({ reconciled: false, inflow: 0, outflow: 3_000_000 }),
    ])

    expect(bankTransactionSummary(result)).toContain("2 transaksi")
    expect(bankTransactionSummary(result)).toContain("belum 1")
  })
})
