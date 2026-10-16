import { describe, it, expect } from "vitest"
import { buildTrialBalanceReport } from "../trial-balance-report"
import type { TableRow } from "@/lib/pdf/engine/types"
import type { TrialBalanceLine } from "@/lib/finance/trial-balance"

function line(over: Partial<TrialBalanceLine> = {}): TrialBalanceLine {
  return { id: 1, code: "1101", name: "Kas & Bank", type: "ASSET", totalDebit: 1_000_000, totalCredit: 0, ...over }
}

function rowSummary(row: TableRow): string {
  switch (row.kind) {
    case "group":
      return `group:${row.label}`
    case "notice":
      return `notice:${row.text}`
    case "data":
      return `data:${row.cells.join("|")}`
    default:
      return `${row.grand ? "grand" : "total"}:${row.label}|${row.cells.join("|")}`
  }
}

const BASE = {
  lines: [
    line(),
    line({ id: 2, code: "2101", name: "Utang Usaha", type: "LIABILITY", totalDebit: 0, totalCredit: 1_000_000 }),
  ],
  grandTotalDebit: 1_000_000,
  grandTotalCredit: 1_000_000,
  isBalanced: true,
  asOfLabel: "31 Oktober 2026",
}

describe("buildTrialBalanceReport", () => {
  it("menyusun Kode | Nama Akun | Debit | Kredit dengan baris Total", () => {
    const { table, landscape } = buildTrialBalanceReport(BASE)

    expect(landscape).toBe(false)
    expect(table.columns.map((column) => column.header)).toEqual(["Kode", "Nama Akun", "Debit", "Kredit"])
    expect(table.rows.map(rowSummary)).toEqual([
      "data:1101|Kas & Bank|1.000.000|",
      "data:2101|Utang Usaha||1.000.000",
      "grand:Total|1.000.000|1.000.000",
    ])
  })

  it("membiarkan sisi yang tidak bergerak kosong, seperti kebiasaan cetak neraca saldo", () => {
    const { table } = buildTrialBalanceReport(BASE)

    const [first, second] = table.rows
    expect(first?.kind === "data" ? first.cells[3] : null).toBe("")
    expect(second?.kind === "data" ? second.cells[2] : null).toBe("")
  })

  it("memberi peringatan bila debit tidak sama dengan kredit", () => {
    const { table } = buildTrialBalanceReport({
      ...BASE,
      grandTotalCredit: 900_000,
      isBalanced: false,
    })

    const notice = table.rows.at(-1)
    expect(notice?.kind).toBe("notice")
    expect(notice?.kind === "notice" ? notice.text : "").toContain("selisih 100.000")
  })

  it("menampilkan pesan kosong bila belum ada jurnal, tanpa baris Total nol", () => {
    const { table } = buildTrialBalanceReport({
      ...BASE,
      lines: [],
      grandTotalDebit: 0,
      grandTotalCredit: 0,
    })

    expect(table.rows).toHaveLength(1)
    expect(table.rows[0]).toMatchObject({ kind: "notice" })
    expect(table.rows.some((row) => row.kind === "total")).toBe(false)
  })

  it("menambahkan kolom pembanding pada tabel yang sama, bukan tabel terpisah", () => {
    const { table, landscape } = buildTrialBalanceReport({
      ...BASE,
      comparison: {
        label: "30 September 2026",
        rows: [
          { id: 1, code: "1101", name: "Kas & Bank", net1: 1_000_000, net2: 400_000 },
          { id: 2, code: "2101", name: "Utang Usaha", net1: -1_000_000, net2: -400_000 },
        ],
      },
    })

    expect(landscape).toBe(true)
    expect(table.columns.map((column) => column.header)).toEqual([
      "Kode",
      "Nama Akun",
      "Per 31 Oktober 2026",
      "Per 30 September 2026",
      "Selisih",
    ])
    expect(table.rows.map(rowSummary)).toEqual([
      "data:1101|Kas & Bank|1.000.000|400.000|600.000",
      "data:2101|Utang Usaha|(1.000.000)|(400.000)|(600.000)",
      "grand:Total|0|0|0",
    ])
  })

  it("menyusun kolom dengan total lebar yang muat di A4 (tegak & mendatar)", () => {
    const portrait = buildTrialBalanceReport(BASE)
    const landscape = buildTrialBalanceReport({
      ...BASE,
      comparison: { label: "30 September 2026", rows: [{ id: 1, code: "1101", name: "Kas", net1: 1, net2: 2 }] },
    })

    const width = (rows: { columns: { width: number }[] }) =>
      rows.columns.reduce((sum, column) => sum + column.width, 0)

    // Area isi A4 tegak = 180mm, mendatar = 267mm.
    expect(width(portrait.table)).toBeLessThanOrEqual(180)
    expect(width(landscape.table)).toBeLessThanOrEqual(267)
  })

  it("menandai tabel pembanding kosong dengan catatan, bukan baris Total palsu", () => {
    const { table } = buildTrialBalanceReport({
      ...BASE,
      comparison: { label: "30 September 2026", rows: [] },
    })

    expect(table.rows).toHaveLength(1)
    expect(table.rows[0]).toMatchObject({ kind: "notice" })
  })
})
