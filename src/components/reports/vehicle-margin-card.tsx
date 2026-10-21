import type { VehicleMarginReport, VehicleMarginRow } from "@/lib/reports/vehicle-margin-data"

type MarginRowWithMaterialFlag = VehicleMarginRow & {
  // Kontrak BOT 3 t_e9ef3980; opsional agar UI tidak mengada-ada sebelum loader menerbitkan.
  hasUnlinkedMaterial?: boolean
}
import { formatAccounting } from "@/lib/utils/format"
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

/**
 * F-2026-10-22-001: permukaan margin job kendaraan.
 *
 * Murni presentasi dari `loadVehicleMarginReport` (builder `buildVehicleMargin`,
 * F-2026-10-21-033). Angka, urutan baris, persen, dan total tampil dari loader
 * apa adanya; komponen tidak menjumlah atau menghitung ulang margin. Label
 * kontrak loader wajib "margin job kendaraan", bukan laba akuntansi.
 */
export function VehicleMarginCard({ report }: Readonly<{ report: VehicleMarginReport }>) {
  const { rows, totals } = report
  const materialRows = rows as MarginRowWithMaterialFlag[]
  const currency = (value: number) => formatAccounting(value, { decimals: 2 })

  return (
    <ReportCardShell
      label={report.label}
      title={`Margin Job Kendaraan (${rows.length} kendaraan)`}
      summary={<>{report.periodCaption} — label kontrak: {report.label}</>}
      isEmpty={rows.length === 0}
      emptyText="Tidak ada margin job kendaraan dalam periode ini"
    >
      <DetailTable data-report-table="margin job kendaraan">
        <DetailTableHead>
          <DetailTableTh>Kendaraan</DetailTableTh>
          <DetailTableTh>Pelanggan</DetailTableTh>
          <DetailTableTh align="right">Pendapatan</DetailTableTh>
          <DetailTableTh align="right">Material</DetailTableTh>
          <DetailTableTh align="right">Biaya Produksi</DetailTableTh>
          <DetailTableTh align="right">Biaya Lain</DetailTableTh>
          <DetailTableTh align="right">Total Biaya</DetailTableTh>
          <DetailTableTh align="right">Margin Job Kendaraan</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          {materialRows.map((row) => {
            const isUnassigned = row.customerVehicleId === null
            return (
              <DetailTableRow key={row.customerVehicleId ?? "tanpa-kendaraan"}>
                <DetailTableTd className="font-medium">
                  {isUnassigned ? "Tanpa kendaraan" : row.vehiclePlate || "—"}
                  {row.hasUnlinkedRevenue ? (
                    <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning">
                      Sebagian
                    </span>
                  ) : null}
                  {row.hasUnlinkedMaterial ? (
                    <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning">
                      Ada material belum tertaut
                    </span>
                  ) : null}
                </DetailTableTd>
                <DetailTableTd>{row.customerName}</DetailTableTd>
                <DetailTableTd align="right">{currency(row.revenue)}</DetailTableTd>
                <DetailTableTd align="right">{currency(row.materialCost)}</DetailTableTd>
                <DetailTableTd align="right">{currency(row.productionCost)}</DetailTableTd>
                <DetailTableTd align="right">{currency(row.otherCost)}</DetailTableTd>
                <DetailTableTd align="right">{currency(row.totalCost)}</DetailTableTd>
                <DetailTableTd
                  align="right"
                  className={row.profit >= 0 ? "text-success font-medium" : "text-danger font-medium"}
                >
                  {currency(row.profit)}
                  <span className="ml-2 text-xs text-muted-foreground">{row.marginPercent.toFixed(1)}%</span>
                </DetailTableTd>
              </DetailTableRow>
            )
          })}
        </DetailTableBody>
        <DetailTableFoot>
          <DetailTableFootRow>
            <DetailTableTd colSpan={2} className="font-bold">TOTAL</DetailTableTd>
            <DetailTableTd align="right" className="font-bold">{currency(totals.revenue)}</DetailTableTd>
            <DetailTableTd align="right" className="font-bold">—</DetailTableTd>
            <DetailTableTd align="right" className="font-bold">—</DetailTableTd>
            <DetailTableTd align="right" className="font-bold">—</DetailTableTd>
            <DetailTableTd align="right" className="font-bold">{currency(totals.totalCost)}</DetailTableTd>
            <DetailTableTd align="right" className={totals.profit >= 0 ? "font-bold text-success" : "font-bold text-danger"}>
              {currency(totals.profit)}
              <span className="ml-2 text-xs text-muted-foreground">{totals.marginPercent.toFixed(1)}%</span>
            </DetailTableTd>
          </DetailTableFootRow>
        </DetailTableFoot>
      </DetailTable>

      <p className="mt-4 text-xs text-muted-foreground">
        Margin job kendaraan adalah ringkasan read-only dari job yang sudah tertagih dan berbiaya; bukan laba
        akuntansi dan tidak memakai angka ini sebagai dasar harga, komisi, atau pembayaran.
      </p>
    </ReportCardShell>
  )
}
