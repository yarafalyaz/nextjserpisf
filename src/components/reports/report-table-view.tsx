import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"
import Link from "next/link"
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
              <DetailTableRow key={`group-${row.label}-${index}`} className="group">
                <DetailTableTd colSpan={columns.length}>{row.label}</DetailTableTd>
              </DetailTableRow>
            )
          }

          if (row.kind === "notice") {
            return (
              <DetailTableRow key={`notice-${row.text}-${index}`}>
                <DetailTableTd colSpan={columns.length} className="muted">
                  {row.text}
                </DetailTableTd>
              </DetailTableRow>
            )
          }

          if (row.kind === "data") {
            const dataRowKey = `data-${row.cells[0] ?? ""}-${row.cells[1] ?? ""}-${index}`
            return (
              <DetailTableRow key={dataRowKey}>
                {row.cells.map((cell, cellIndex) => {
                  const isFirstOrSecondText = cellIndex === 0 || (cellIndex === 1 && columns[cellIndex]?.align !== "right")
                  const content = row.href && isFirstOrSecondText ? (
                    <Link href={row.href} className="hover:underline">
                      {cell}
                    </Link>
                  ) : (
                    cell
                  )

                  return (
                    <DetailTableTd
                      key={`cell-${cellIndex}-${columns[cellIndex]?.header ?? ""}`}
                      align={columns[cellIndex]?.align ?? "left"}
                      className={row.bold ? "font-semibold" : undefined}
                    >
                      {content}
                    </DetailTableTd>
                  )
                })}
              </DetailTableRow>
            )
          }

          // total | grand — label membentang kolom kiri yang tersisa.
          return (
            <DetailTableRow key={`total-${row.label}-${index}`} className={row.grand ? "grand" : "subtotal"}>
              <DetailTableTd colSpan={columns.length - row.cells.length}>{row.label}</DetailTableTd>
              {row.cells.map((cell, cellIndex) => (
                <DetailTableTd key={`tot-cell-${cellIndex}`} align="right">
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
