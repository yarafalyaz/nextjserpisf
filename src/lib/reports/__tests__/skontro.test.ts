import { describe, expect, it } from "vitest"

import { buildSkontroBalanceSheet, type SkontroBalanceSheetInput } from "../skontro"

const base: SkontroBalanceSheetInput = {
  assetRows: [{ code: "1101", name: "Kas", balance: 5_000_000 }],
  liabilityRows: [{ code: "2101", name: "Utang Usaha", balance: 2_000_000 }],
  equityRows: [{ code: "3101", name: "Modal", balance: 3_000_000 }],
  totalAssets: 5_000_000,
  totalLiabilities: 2_000_000,
  totalEquity: 3_000_000,
  isBalanced: true,
}

function totalRow(input: SkontroBalanceSheetInput): string[] {
  const row = buildSkontroBalanceSheet(input).rows.find(
    (r) => r.kind === "data" && r.cells.includes("Jumlah Aktiva"),
  )
  if (!row || row.kind !== "data") throw new Error("baris jumlah tidak ditemukan")
  return row.cells
}

function noticeOf(input: SkontroBalanceSheetInput) {
  const row = buildSkontroBalanceSheet(input).rows.find((r) => r.kind === "notice")
  return row?.kind === "notice" ? row.text : ""
}

describe("buildSkontroBalanceSheet", () => {
  it("menyusun Aktiva dan Pasiva berdampingan dengan jumlah kedua sisi", () => {
    expect(totalRow(base)).toEqual([
      "",
      "Jumlah Aktiva",
      "5.000.000",
      "",
      "Jumlah Pasiva",
      "5.000.000",
    ])
    expect(noticeOf(base)).toBe("")
  })

  it("mempertahankan selisih sen pada jumlah dan peringatan neraca tidak seimbang", () => {
    const input: SkontroBalanceSheetInput = {
      ...base,
      totalAssets: 5_000_000.25,
      isBalanced: false,
    }

    expect(totalRow(input)).toEqual([
      "",
      "Jumlah Aktiva",
      "5.000.000,25",
      "",
      "Jumlah Pasiva",
      "5.000.000,00",
    ])
    expect(noticeOf(input)).toContain("Jumlah Aktiva (5.000.000,25)")
    expect(noticeOf(input)).toContain("Jumlah Pasiva (5.000.000,00)")
    expect(noticeOf(input)).toContain("selisih 0,25")
  })

  it("jumlah pasiva dari dua nilai ber-sen tampil hingga dua desimal", () => {
    // Catatan: untuk input Decimal(15,2) hasil penjumlahan float mentah dan
    // safeAdd sama-sama membulat ke dua desimal yang sama, jadi tes ini menjaga
    // tampilan (bukan membuktikan safeAdd); safeAdd tetap dipakai agar konsisten
    // dengan laporan lain yang mengakumulasi nilai ber-sen.
    const input: SkontroBalanceSheetInput = {
      ...base,
      totalAssets: 5_000_000.35,
      totalLiabilities: 2_000_000.1,
      totalEquity: 3_000_000.2,
      isBalanced: false,
    }

    expect(totalRow(input)).toEqual([
      "",
      "Jumlah Aktiva",
      "5.000.000,35",
      "",
      "Jumlah Pasiva",
      "5.000.000,30",
    ])
    expect(noticeOf(input)).toContain("selisih 0,05")
  })
})
