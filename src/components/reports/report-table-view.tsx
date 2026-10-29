import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"
import {
  DetailTable,
  DetailTableBody,
  DetailTableHead,
  DetailTableRow,
  DetailTableTd,
  DetailTableTh,
} from "@/components/ui/detail-table"

/**
 * Renderer layar untuk tabel laporan berbentuk daftar (`TableRow` dari engine).
 *
 * Memakai primitif `DetailTable` (kelas `.stmt`) supaya tampilan lembar laporan
 * sama dengan statement: garis horizontal saja, angka rata kanan bertabular, dan
 * hasil cetak identik dengan layar. `data-report-table` dipertahankan agar ekspor
 * CSV yang membaca DOM tetap bekerja selama migrasi ke engine PDF berjalan.
 */
export function ReportTableView({
  columns,
  rows,
  tableLabel,
}: {
  columns: TableColumn[]
  rows: TableRow[]
  tableLabel: string
}) {
  return (
    <DetailTable data-report-table={tableLabel} aria-label={tableLabel}>
      <DetailTableHead>
        {columns.map((column, index) => (
          <DetailTableTh key={`${column.header}-${index}`} align={column.align}>
            {column.header}
          </DetailTableTh>
        ))}
      </DetailTableHead>
      <DetailTableBody>
        {rows.map((row, index) => {
          if (row.kind === "group") {
            return (
              <DetailTableRow key={`group-${index}`} className="group">
                <DetailTableTd colSpan={columns.length}>{row.label}</DetailTableTd>
              </DetailTableRow>
            )
          }

          if (row.kind === "notice") {
            return (
              <DetailTableRow key={`notice-${index}`}>
                <DetailTableTd colSpan={columns.length} className="muted">
                  {row.text}
                </DetailTableTd>
              </DetailTableRow>
            )
          }

          if (row.kind === "data") {
            return (
              <DetailTableRow key={`data-${index}`}>
                {row.cells.map((cell, cellIndex) => (
                  <DetailTableTd
                    key={cellIndex}
                    align={columns[cellIndex]?.align ?? "left"}
                    className={row.bold ? "font-semibold" : undefined}
                  >
                    {cell}
                  </DetailTableTd>
                ))}
              </DetailTableRow>
            )
          }

          // total | grand — label membentang kolom kiri yang tersisa.
          return (
            <DetailTableRow key={`total-${index}`} className={row.grand ? "grand" : "subtotal"}>
              <DetailTableTd colSpan={columns.length - row.cells.length}>{row.label}</DetailTableTd>
              {row.cells.map((cell, cellIndex) => (
                <DetailTableTd key={cellIndex} align="right">
                  {cell}
                </DetailTableTd>
              ))}
            </DetailTableRow>
          )
        })}
      </DetailTableBody>
    </DetailTable>
  )
}
