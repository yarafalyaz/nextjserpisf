import type { StatementTable, StatementTableRow } from "@/lib/reports/statement-table"

function csvCell(value: string): string {
  const safeValue = /^[=+\-@\t|%]/.test(value) ? `\t${value}` : value
  return `"${safeValue.replace(/"/g, '""')}"`
}

function statementRowCells(row: StatementTableRow, columnCount: number): string[] {
  if (row.kind === "group" || row.kind === "notice") {
    return [row.kind === "group" ? row.label : row.text, ...Array(columnCount - 1).fill("")]
  }

  if (row.kind === "line") {
    return [row.code, row.name, ...row.values]
  }

  const emptyCount = Math.max(0, columnCount - row.values.length - 1)
  return [row.label, ...Array(emptyCount).fill(""), ...row.values]
}

export function serializeStatementCsv(title: string, table: StatementTable): string {
  const rows = [
    [title],
    [],
    table.columns.map((column) => column.header),
    ...table.rows.map((row) => statementRowCells(row, table.columns.length)),
  ]

  return `\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`
}
