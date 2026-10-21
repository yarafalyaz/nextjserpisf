import type { ProjectPlRow } from "@/lib/reports/project-pl-data"
import { formatAccounting, formatNumber } from "@/lib/utils/format"
import { statusLabel } from "@/lib/utils/status-labels"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
  DetailTableFoot,
  DetailTableFootRow,
} from "@/components/ui/detail-table"
import { ReportCardShell } from "./report-card-shell"

function sumRows(rows: ProjectPlRow[], pick: (row: ProjectPlRow) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0)
}

/**
 * F-2026-10-21-029 (tahap frontend): tabel L/R per proyek.
 *
 * Murni presentasi dari `loadProjectPlReport` (builder `buildProjectPl`):
 * pendapatan, material, biaya produksi, beban lain, laba, dan margin tampil
 * apa adanya per baris builder — komponen ini tidak mengagregasi dokumen
 * mentah dan tidak menghitung ulang aturan uang. Total/footer hanya menjumlah
 * kolom hasil builder untuk tampilan; memo jam timesheet tampil terpisah dan
 * BUKAN biaya (tidak masuk total biaya / laba).
 */
export function ProjectPlCard({ rows }: Readonly<{ rows: ProjectPlRow[] }>) {
  const totalRevenue = sumRows(rows, (r) => r.revenue)
  const totalProfit = sumRows(rows, (r) => r.profit)
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0
  const unpulledRows = rows.filter((r) => r.unpulledTimesheetCount > 0)

  return (
    <ReportCardShell
      label="Laba Rugi per Proyek"
      title={`Detail per Proyek (${rows.length} proyek)`}
      summary={<>{rows.length} proyek pada periode ini</>}
      isEmpty={rows.length === 0}
      emptyText="Tidak ada proyek dalam periode ini"
    >
      <DetailTable data-report-table="Laba Rugi per Proyek">
        <DetailTableHead>
          <DetailTableTh>No. Dok</DetailTableTh>
          <DetailTableTh>Proyek</DetailTableTh>
          <DetailTableTh>Pelanggan</DetailTableTh>
          <DetailTableTh>Kendaraan</DetailTableTh>
          <DetailTableTh>Status</DetailTableTh>
          <DetailTableTh align="right">Pendapatan</DetailTableTh>
          <DetailTableTh align="right">Material</DetailTableTh>
          <DetailTableTh align="right">Biaya Produksi</DetailTableTh>
          <DetailTableTh align="right">Beban Lain</DetailTableTh>
          <DetailTableTh align="right">Total Biaya</DetailTableTh>
          <DetailTableTh align="right">Laba</DetailTableTh>
          <DetailTableTh align="right">Margin</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          {rows.map((row) => (
            <DetailTableRow key={row.projectId}>
              <DetailTableTd className="font-mono text-sm">{row.projectDocumentNo || "-"}</DetailTableTd>
              <DetailTableTd className="font-medium">{row.projectName}</DetailTableTd>
              <DetailTableTd>{row.customerName}</DetailTableTd>
              <DetailTableTd className="text-sm">{row.vehiclePlate || "-"}</DetailTableTd>
              <DetailTableTd>{statusLabel(row.projectStatus)}</DetailTableTd>
              <DetailTableTd align="right">{formatAccounting(row.revenue)}</DetailTableTd>
              <DetailTableTd align="right">{formatAccounting(row.materialCost)}</DetailTableTd>
              <DetailTableTd align="right">{formatAccounting(row.productionCost)}</DetailTableTd>
              <DetailTableTd align="right">
                {formatAccounting(row.expenseCost + row.pettyCashCost + row.vendorBillCost)}
              </DetailTableTd>
              <DetailTableTd align="right">{formatAccounting(row.totalCost)}</DetailTableTd>
              <DetailTableTd
                align="right"
                className={row.profit >= 0 ? "text-success font-medium" : "text-danger font-medium"}
              >
                {formatAccounting(row.profit)}
              </DetailTableTd>
              <DetailTableTd
                align="right"
                className={row.marginPercent >= 20 ? "text-success" : row.marginPercent >= 0 ? "text-warning" : "text-danger"}
              >
                {row.marginPercent.toFixed(1)}%
              </DetailTableTd>
            </DetailTableRow>
          ))}
        </DetailTableBody>
        <DetailTableFoot>
          <DetailTableFootRow>
            <DetailTableTd colSpan={5} className="font-bold">TOTAL</DetailTableTd>
            <DetailTableTd align="right" className="font-bold">{formatAccounting(totalRevenue)}</DetailTableTd>
            <DetailTableTd align="right" className="font-bold">{formatAccounting(sumRows(rows, (r) => r.materialCost))}</DetailTableTd>
            <DetailTableTd align="right" className="font-bold">{formatAccounting(sumRows(rows, (r) => r.productionCost))}</DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              {formatAccounting(sumRows(rows, (r) => r.expenseCost + r.pettyCashCost + r.vendorBillCost))}
            </DetailTableTd>
            <DetailTableTd align="right" className="font-bold">{formatAccounting(sumRows(rows, (r) => r.totalCost))}</DetailTableTd>
            <DetailTableTd align="right" className={totalProfit >= 0 ? "font-bold text-success" : "font-bold text-danger"}>
              {formatAccounting(totalProfit)}
            </DetailTableTd>
            <DetailTableTd align="right" className="font-bold">{avgMargin.toFixed(1)}%</DetailTableTd>
          </DetailTableFootRow>
        </DetailTableFoot>
      </DetailTable>

      {unpulledRows.length > 0 && (
        <section aria-label="Memo jam timesheet belum ditarik" className="mt-5">
          <h3 className="text-sm font-semibold text-foreground">Memo Jam Timesheet Belum Ditarik</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Jam berikut belum ditarik ke biaya produksi — memo jam saja, bukan biaya dan tidak mengurangi laba.
          </p>
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Proyek</DetailTableTh>
              <DetailTableTh align="right">Baris Timesheet</DetailTableTh>
              <DetailTableTh align="right">Jam Belum Ditarik</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {unpulledRows.map((row) => (
                <DetailTableRow key={row.projectId}>
                  <DetailTableTd className="font-medium">{row.projectName}</DetailTableTd>
                  <DetailTableTd align="right">{formatNumber(row.unpulledTimesheetCount)}</DetailTableTd>
                  <DetailTableTd align="right">{formatNumber(row.unpulledTimesheetHours, 2)} jam</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </section>
      )}
    </ReportCardShell>
  )
}
