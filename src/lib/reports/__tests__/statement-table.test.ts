import { describe, it, expect } from "vitest"
import { buildBalanceSheetTable, buildIncomeStatementTable, statementAmount } from "../statement-table"
import type { StatementRow } from "@/lib/reports/statement-display"
import type { StatementTableRow } from "@/lib/reports/statement-table"
import type { IncomeStatementResult } from "@/lib/finance/income-statement"

/** Ringkasan baris untuk membandingkan urutan laporan tanpa noise. */
function describeRow(row: StatementTableRow): string {
  switch (row.kind) {
    case "line":
      return `line:${row.name}`
    case "notice":
      return `notice:${row.text}`
    default:
      return `${row.kind}:${row.label}`
  }
}

function row(over: Partial<StatementRow> = {}): StatementRow {
  return {
    id: 1,
    code: "1000",
    name: "Kas",
    balance: 1_500_000,
    level: 0,
    hasChildren: false,
    ...over,
  }
}

function incomeResult(over: Partial<IncomeStatementResult> = {}): IncomeStatementResult {
  return {
    revenueData: [],
    cogsData: [],
    expenseData: [],
    otherIncomeData: [],
    otherExpenseData: [],
    totalRevenue: 0,
    totalCogs: 0,
    grossProfit: 0,
    totalExpense: 0,
    operatingProfit: 0,
    totalOtherIncome: 0,
    totalOtherExpense: 0,
    totalOther: 0,
    netProfit: 0,
    margin: 0,
    ...over,
  }
}

describe("statementAmount", () => {
  it("memakai titik ribuan dan menampilkan nol sebagai angka", () => {
    expect(statementAmount(1_500_000)).toBe("1.500.000")
    // Nol harus terbaca sebagai 0, bukan "–": pada statement kolom angka nol
    // tetap nominal, dan engine PDF menggambar sel yang sama dengan layar.
    expect(statementAmount(0)).toBe("0")
  })

  it("menaruh angka negatif dalam tanda kurung", () => {
    expect(statementAmount(-2_500_000)).toBe("(2.500.000)")
  })
})

describe("buildBalanceSheetTable", () => {
  const base = {
    asOfLabel: "31 Oktober 2026",
    assetRows: [row({ id: 1, code: "1000", name: "Kas", balance: 5_000_000 })],
    liabilityRows: [row({ id: 2, code: "2000", name: "Utang Usaha", balance: 2_000_000 })],
    equityRows: [row({ id: 3, code: "3000", name: "Modal", balance: 3_000_000 })],
    totalAssets: 5_000_000,
    totalLiabilities: 2_000_000,
    totalEquity: 3_000_000,
    isBalanced: true,
  }

  it("menyusun Aset → Kewajiban → Ekuitas dan ditutup total kewajiban+ekuitas", () => {
    const table = buildBalanceSheetTable(base)

    expect(table.rows.map(describeRow)).toEqual([
      "group:Aset",
      "line:Kas",
      "subtotal:Jumlah Aset",
      "group:Kewajiban",
      "line:Utang Usaha",
      "subtotal:Jumlah Kewajiban",
      "group:Ekuitas",
      "line:Modal",
      "subtotal:Jumlah Ekuitas",
      "grand:Total Kewajiban dan Ekuitas",
    ])

    const grand = table.rows.at(-1)
    expect(grand).toMatchObject({ kind: "grand", values: ["5.000.000"] })
  })

  it("tidak mengulang periode di kolom angka (periode sudah di baris meta)", () => {
    const table = buildBalanceSheetTable(base)

    expect(table.columns).toEqual([
      { header: "Kode", align: "left" },
      { header: "Deskripsi", align: "left" },
      { header: "Nilai (IDR)", align: "right" },
    ])
  })

  it("meneruskan level dan hasChildren untuk indentasi", () => {
    const table = buildBalanceSheetTable({
      ...base,
      assetRows: [
        row({ id: 10, code: "1100", name: "Kas Kecil", level: 1, hasChildren: true }),
      ],
    })

    expect(table.rows[1]).toMatchObject({
      kind: "line",
      code: "1100",
      name: "Kas Kecil",
      level: 1,
      hasChildren: true,
    })
  })

  it("menambahkan baris peringatan berisi selisih bila neraca tidak seimbang", () => {
    // Aset 5.000.000 vs kewajiban 2.000.000 + ekuitas 2.000.000 → selisih 1.000.000.
    const table = buildBalanceSheetTable({
      ...base,
      totalEquity: 2_000_000,
      isBalanced: false,
    })

    const notice = table.rows.at(-1)
    expect(notice?.kind).toBe("notice")
    const text = notice?.kind === "notice" ? notice.text : ""
    expect(text).toContain("Jumlah Aset (5.000.000)")
    expect(text).toContain("Total Kewajiban dan Ekuitas (4.000.000)")
    expect(text).toContain("selisih 1.000.000")
  })

  it("tidak menambahkan peringatan saat neraca seimbang", () => {
    const table = buildBalanceSheetTable(base)
    expect(table.rows.some((r) => r.kind === "notice")).toBe(false)
  })
})

describe("buildIncomeStatementTable", () => {
  const result = incomeResult({
    totalRevenue: 1_000_000,
    totalCogs: 400_000,
    grossProfit: 600_000,
    totalExpense: 200_000,
    operatingProfit: 400_000,
    totalOtherIncome: 50_000,
    totalOtherExpense: 20_000,
    totalOther: 30_000,
    netProfit: 430_000,
  })

  const input = {
    columnLabel: "1 Okt - 31 Okt 2026",
    showPercent: false,
    revenueRows: [row({ id: 1, code: "4000", name: "Penjualan", balance: 1_000_000 })],
    cogsRows: [row({ id: 2, code: "5000", name: "HPP", balance: 400_000 })],
    operatingExpenseRows: [row({ id: 3, code: "6000", name: "Gaji", balance: 200_000 })],
    otherIncomeRows: [row({ id: 4, code: "8000", name: "Bunga", balance: 50_000 })],
    otherExpenseRows: [row({ id: 5, code: "9000", name: "Denda", balance: 20_000 })],
    result,
  }

  it("menyusun tahapan laba rugi multi tahap", () => {
    const table = buildIncomeStatementTable(input)

    expect(table.rows.map(describeRow)).toEqual([
      "group:Pendapatan",
      "line:Penjualan",
      "subtotal:Jumlah Pendapatan",
      "group:Beban Pokok Penjualan",
      "line:HPP",
      "subtotal:Jumlah Beban Pokok Penjualan",
      "total:Laba Kotor",
      "group:Beban Operasional",
      "line:Gaji",
      "subtotal:Jumlah Beban Operasional",
      "total:Pendapatan Operasional",
      "group:Pendapatan dan Beban Non Operasional",
      "subtotal:Pendapatan Non Operasional",
      "line:Bunga",
      "subtotal:Jumlah Pendapatan Non Operasional",
      "subtotal:Beban Non Operasional",
      "line:Denda",
      "subtotal:Jumlah Beban Non Operasional",
      "subtotal:Jumlah Pendapatan dan Beban Non Operasional",
      "grand:Laba Bersih",
    ])
  })

  it("menampilkan beban non operasional sebagai angka negatif", () => {
    const table = buildIncomeStatementTable(input)
    const denda = table.rows.find((r) => r.kind === "line" && r.name === "Denda")

    expect(denda).toMatchObject({ values: ["(20.000)"] })
  })

  it("menyembunyikan kelompok HPP bila tidak ada isinya", () => {
    const table = buildIncomeStatementTable({
      ...input,
      cogsRows: [],
      result: incomeResult({ totalRevenue: 1_000_000, totalCogs: 0, netProfit: 1_000_000 }),
    })

    expect(table.rows.some((r) => r.kind === "group" && r.label === "Beban Pokok Penjualan")).toBe(false)
  })

  it("menyembunyikan kelompok non operasional bila tidak ada isinya", () => {
    const table = buildIncomeStatementTable({
      ...input,
      otherIncomeRows: [],
      otherExpenseRows: [],
      result: incomeResult({ totalRevenue: 1_000_000, netProfit: 1_000_000 }),
    })

    expect(
      table.rows.some((r) => r.kind === "group" && r.label === "Pendapatan dan Beban Non Operasional"),
    ).toBe(false)
  })

  it("menambahkan kolom persen dari pendapatan saat diminta", () => {
    const table = buildIncomeStatementTable({ ...input, showPercent: true })

    expect(table.columns).toEqual([
      { header: "Kode", align: "left" },
      { header: "Deskripsi", align: "left" },
      { header: "Nilai (IDR)", align: "right" },
      { header: "%", align: "right" },
    ])

    const penjualan = table.rows.find((r) => r.kind === "line" && r.name === "Penjualan")
    expect(penjualan).toMatchObject({ values: ["1.000.000", "100.0%"] })

    const gaji = table.rows.find((r) => r.kind === "line" && r.name === "Gaji")
    expect(gaji).toMatchObject({ values: ["200.000", "20.0%"] })
  })
})
