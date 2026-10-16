import type { StatementTable } from "@/lib/reports/statement-table"

/**
 * Renderer layar untuk `StatementTable` (Neraca, Laba Rugi).
 *
 * Markup sengaja tetap memakai kelas `.stmt` dan atribut `data-report-table`,
 * karena ekspor CSV yang lama membaca DOM — atribut itu yang menjaga ekspor CSV
 * (dan tombol cetak laporan lain) tetap bekerja selama migrasi ke engine PDF
 * berjalan bertahap.
 */
export function StatementTableView({
  table,
  tableLabel,
}: {
  table: StatementTable
  tableLabel: string
}) {
  const columnCount = table.columns.length

  return (
    <table className="stmt" data-report-table={tableLabel}>
      <thead>
        <tr>
          {table.columns.map((column, index) => (
            <th
              key={`${column.header}-${index}`}
              className={
                index === 0 ? "col-code" : column.align === "right" ? "num" : undefined
              }
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, index) => {
          if (row.kind === "group") {
            return (
              <tr key={`group-${index}`} className="group">
                <td colSpan={columnCount}>{row.label}</td>
              </tr>
            )
          }

          if (row.kind === "notice") {
            return (
              <tr key={`notice-${index}`}>
                <td colSpan={columnCount} className="muted" style={{ paddingTop: 8 }}>
                  {row.text}
                </td>
              </tr>
            )
          }

          if (row.kind === "line") {
            return (
              <tr key={row.id} className={row.hasChildren ? "row-parent" : undefined}>
                <td className="col-code">{row.code}</td>
                <td className={`indent-${Math.min(row.level + 1, 3)}`}>{row.name}</td>
                {row.values.map((value, columnIndex) => (
                  <td key={columnIndex} className="num">
                    {value}
                  </td>
                ))}
              </tr>
            )
          }

          // subtotal | total | grand — label membentang kolom kiri yang tersisa.
          return (
            <tr key={`${row.kind}-${index}`} className={row.kind}>
              <td
                colSpan={columnCount - row.values.length}
                className={
                  row.kind === "subtotal" && row.indent ? `indent-${row.indent}` : undefined
                }
              >
                {row.label}
              </td>
              {row.values.map((value, columnIndex) => (
                <td key={columnIndex} className="num">
                  {value}
                </td>
              ))}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
