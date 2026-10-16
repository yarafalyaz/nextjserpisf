import { describe, expect, it } from "vitest"
import { serializeStatementCsv } from "../statement-csv"
import type { StatementTable } from "../statement-table"

const table: StatementTable = {
  columns: [
    { header: "Kode", align: "left" },
    { header: "Deskripsi", align: "left" },
    { header: "Per 31 Oktober 2026", align: "right" },
  ],
  rows: [
    { kind: "group", label: "Aset" },
    {
      kind: "line",
      id: 1,
      code: "1000",
      name: 'Kas "Utama"',
      level: 0,
      hasChildren: false,
      values: ["1.500.000"],
    },
    { kind: "subtotal", label: "Jumlah Aset", values: ["1.500.000"] },
    { kind: "notice", text: "Perhatian: selisih ditemukan" },
  ],
}

describe("serializeStatementCsv", () => {
  it("serializes statement headings and row types as structured CSV", () => {
    expect(serializeStatementCsv("Neraca", table)).toBe(
      '\ufeff"Neraca"\n\n"Kode","Deskripsi","Per 31 Oktober 2026"\n"Aset","",""\n"1000","Kas ""Utama""","1.500.000"\n"Jumlah Aset","","1.500.000"\n"Perhatian: selisih ditemukan","",""\n',
    )
  })

  it("escapes spreadsheet formulas in account descriptions", () => {
    const formulaTable: StatementTable = {
      ...table,
      rows: [
        {
          kind: "line",
          id: 2,
          code: "9999",
          name: "=1+1",
          level: 0,
          hasChildren: false,
          values: ["0"],
        },
      ],
    }

    expect(serializeStatementCsv("Neraca", formulaTable)).toContain(
      '"\t=1+1"',
    )
  })
})
