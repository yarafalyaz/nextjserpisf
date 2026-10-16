import { describe, expect, it } from "vitest"

import {
  buildPayrollByEmployee,
  buildPayrollComposition,
  buildPph21,
  duplicateEmployeePeriods,
  type PayrollRowInput,
} from "@/lib/reports/payroll-reports"

function row(overrides: Partial<PayrollRowInput> = {}): PayrollRowInput {
  return {
    employeeName: "Budi",
    npwp: "01.234.567.8-901.000",
    baseSalary: 8_000_000,
    allowances: 500_000,
    appreciation: 100_000,
    overtime: 400_000,
    deductions: 200_000,
    bpjsHealth: 100_000,
    bpjsEmployment: 50_000,
    pph21: 300_000,
    gross: 9_000_000,
    net: 8_350_000,
    ...overrides,
  }
}

function notices(result: { table: { rows: { kind: string; text?: string }[] } }) {
  return result.table.rows
    .filter((r) => r.kind === "notice")
    .map((r) => r.text ?? "")
    .join(" | ")
}

describe("buildPayrollByEmployee", () => {
  it("mengelompokkan per karyawan dan menjumlahkan kolomnya", () => {
    const result = buildPayrollByEmployee({
      rows: [row({ employeeName: "Budi" }), row({ employeeName: "Budi" }), row({ employeeName: "Ani", baseSalary: 5_000_000, gross: 5_000_000, net: 5_000_000, allowances: 0, appreciation: 0, overtime: 0, deductions: 0, bpjsHealth: 0, bpjsEmployment: 0, pph21: 0 })],
      draftSlips: 0,
      duplicateEmployees: [],
    })

    expect(result.totals.slips).toBe(3)
    expect(result.totals.baseSalary).toBe(21_000_000)
    expect(result.totals.gross).toBe(23_000_000)
    const dataRows = result.table.rows.filter((r) => r.kind === "data")
    expect(dataRows).toHaveLength(2)
  })

  it("menandai slip yang gaji bersihnya kena batas 0, bukan menyembunyikan selisih", () => {
    const result = buildPayrollByEmployee({
      rows: [row({ baseSalary: 1_000_000, gross: 1_000_000, deductions: 2_000_000, net: 0 })],
      draftSlips: 0,
      duplicateEmployees: [],
    })

    expect(result.totals.flooredNet).toBe(1)
    expect(notices(result)).toContain("dibatasi 0")
  })

  it("melaporkan slip draft yang belum dihitung", () => {
    const result = buildPayrollByEmployee({ rows: [row()], draftSlips: 4, duplicateEmployees: [] })

    expect(notices(result)).toContain("4 slip gaji masih berstatus draft")
    expect(result.verdict).toContain("4 draft")
  })

  it("membedakan 'tidak ada slip disetujui' dari daftar kosong", () => {
    const result = buildPayrollByEmployee({ rows: [], draftSlips: 2, duplicateEmployees: [] })

    expect(result.verdict).toContain("Tidak ada slip gaji disetujui")
    expect(notices(result)).toContain("draft belum dihitung")
  })
})

describe("buildPph21", () => {
  it("menjumlahkan PPh 21 dan menampilkan NPWP", () => {
    const result = buildPph21({ rows: [row(), row({ employeeName: "Ani", pph21: 100_000 })], draftSlips: 0 })

    expect(result.totals.pph21).toBe(400_000)
    const first = result.table.rows.find((r) => r.kind === "data")
    expect(first && first.kind === "data" ? first.cells[0] : null).toBe("Ani")
  })

  it("memakai '—' saat NPWP karyawan kosong", () => {
    const result = buildPph21({ rows: [row({ npwp: null })], draftSlips: 0 })
    const data = result.table.rows.find((r) => r.kind === "data")

    expect(data && data.kind === "data" ? data.cells[1] : null).toBe("—")
  })

  it("menjelaskan PPh 21 nol (mungkin di bawah PTKP) dan menegaskan cakupannya", () => {
    const result = buildPph21({ rows: [row({ pph21: 0 })], draftSlips: 0 })

    expect(notices(result)).toContain("bawah PTKP")
    expect(notices(result)).toContain("bukan kewajiban pajak perusahaan")
  })
})

describe("buildPayrollComposition", () => {
  it("menyusun komposisi penerimaan, potongan, dan bersih dengan porsi terhadap bruto", () => {
    const result = buildPayrollComposition({
      rows: [
        row({
          baseSalary: 8_000_000,
          allowances: 0,
          appreciation: 0,
          overtime: 0,
          deductions: 500_000,
          bpjsHealth: 0,
          bpjsEmployment: 0,
          pph21: 0,
          gross: 8_000_000,
          net: 7_500_000,
        }),
      ],
      draftSlips: 0,
    })

    const texts = result.table.rows.map((r) =>
      r.kind === "data" ? r.cells.join(" | ") : r.kind === "total" ? `${r.label} ${r.cells.join(" | ")}` : r.kind === "group" ? r.label : r.kind === "notice" ? r.text : "",
    )
    expect(texts.join("\n")).toContain("Gaji Pokok | 8.000.000 | 100,0%")
    expect(texts.join("\n")).toContain("Gaji Bersih")
  })

  it("memakai 'n/a' saat bruto nol, bukan pembagian dengan nol", () => {
    const result = buildPayrollComposition({
      rows: [row({ baseSalary: 0, allowances: 0, appreciation: 0, overtime: 0, deductions: 0, bpjsHealth: 0, bpjsEmployment: 0, pph21: 0, gross: 0, net: 0 })],
      draftSlips: 0,
    })
    const texts = result.table.rows
      .map((r) => (r.kind === "data" ? r.cells.join(" | ") : ""))
      .join("\n")

    expect(texts).toContain("n/a")
  })
})

describe("duplicateEmployeePeriods", () => {
  it("menemukan karyawan dengan lebih dari satu slip pada periode sama", () => {
    const duplicates = duplicateEmployeePeriods([
      { employeeName: "Budi", period: "2026-10" },
      { employeeName: "Budi", period: "2026-10" },
      { employeeName: "Ani", period: "2026-10" },
      { employeeName: "Budi", period: "2026-11" },
    ])

    expect(duplicates).toContain("Budi")
    expect(duplicates).not.toContain("Ani")
  })
})
