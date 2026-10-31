import { describe, expect, it } from "vitest"

import { parseBankStatementCsv } from "@/lib/finance/bank-statement-csv"

describe("parseBankStatementCsv", () => {
  it("membaca kolom debit/kredit terpisah dengan header Indonesia dan pemisah titik-koma", () => {
    const result = parseBankStatementCsv(
      [
        "Tanggal;Keterangan;Debit;Kredit;Referensi",
        "2026-10-01;Transfer masuk;1500000;0;TRF-1",
        "02/10/2026;Biaya admin;0;6500;",
      ].join("\n"),
    )
    expect(result.errors).toEqual([])
    expect(result.lines).toEqual([
      { date: "2026-10-01", description: "Transfer masuk", amount: 1500000, type: "debit", reference: "TRF-1" },
      { date: "2026-10-02", description: "Biaya admin", amount: 6500, type: "credit", reference: null },
    ])
  })

  it("membaca nominal bertanda: positif debit, negatif kredit (nilai absolut)", () => {
    const result = parseBankStatementCsv("date,description,amount\n2026-10-03,Setoran,250000\n2026-10-04,Penarikan,-75000")
    expect(result.errors).toEqual([])
    expect(result.lines).toEqual([
      { date: "2026-10-03", description: "Setoran", amount: 250000, type: "debit", reference: null },
      { date: "2026-10-04", description: "Penarikan", amount: 75000, type: "credit", reference: null },
    ])
  })

  it("nominal format id-ID (titik ribuan, koma desimal) terbaca", () => {
    const result = parseBankStatementCsv("Tanggal;Keterangan;Nominal\n2026-10-05;Setoran;1.500.000,00")
    expect(result.errors).toEqual([])
    expect(result.lines[0]?.amount).toBe(1500000)
  })

  it("baris rusak dilaporkan per nomor baris file, baris sah tetap terbaca", () => {
    const result = parseBankStatementCsv(
      [
        "Tanggal;Keterangan;Debit;Kredit",
        "2026-10-01;Sah;1000;0",
        "bukan-tanggal;Rusak;1000;0",
        "2026-10-03;Dua arah;1000;500",
        "2026-10-04;Nol;0;0",
        "2026-10-05;Sah dua;0;2000",
      ].join("\n"),
    )
    expect(result.lines.map((line) => line.description)).toEqual(["Sah", "Sah dua"])
    expect(result.errors.map((error) => error.row)).toEqual([3, 4, 5])
    expect(result.errors[0]?.message).toMatch(/tanggal/i)
    expect(result.errors[1]?.message).toMatch(/salah satu/i)
    expect(result.errors[2]?.message).toMatch(/lebih dari 0/i)
  })

  it("header tidak dikenal ditolak sebagai satu error baris 1", () => {
    const result = parseBankStatementCsv("Foo;Bar\n1;2")
    expect(result.lines).toEqual([])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.row).toBe(1)
  })

  it("sel ber-quote dengan pemisah di dalamnya terbaca utuh", () => {
    const result = parseBankStatementCsv(
      'Tanggal;Keterangan;Nominal\n2026-10-06;"Transfer; lunas";42000',
    )
    expect(result.errors).toEqual([])
    expect(result.lines[0]?.description).toBe("Transfer; lunas")
  })
})
