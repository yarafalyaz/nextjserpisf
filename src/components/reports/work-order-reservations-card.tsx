import type { WorkOrderReservations } from "@/lib/reports/work-order-reservations-data"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { ReportCardShell } from "./report-card-shell"
import { formatDate } from "@/lib/utils/format"

/**
 * F-2026-10-22-057-S §2 (AC-RIL-5): tabel reservasi stok di detail WO.
 *
 * Data dari loader read-only `getWorkOrderReservations` (BOT 3 PR #455):
 * baris StockReservation passthrough — status/sisa dari builder
 * `buildWorkOrderReservationRow`, dirilis (tanggal + oleh + alasan) apa
 * adanya. Komponen murni presentasi: tanpa query, tanpa hitung ulang
 * status/sisa dari MI/lapisan. Baris kebutuhan tanpa reservasi (gudang
 * belum ditentukan) tampil terpisah dengan label verbatim builder dan
 * BUKAN "Dilepas" — bukan peristiwa rilis.
 */
export function WorkOrderReservationsCard({
  reservations,
}: Readonly<{ reservations: WorkOrderReservations }>) {
  const { rows, unreserved } = reservations
  const summary =
    rows.length > 0
      ? `${rows.length} reservasi tercatat`
      : "Belum ada reservasi tercatat"
  return (
    <ReportCardShell
      label="Reservasi Stok"
      title="Reservasi Stok"
      summary={summary}
      isEmpty={rows.length === 0 && unreserved.length === 0}
      emptyText="Belum ada reservasi stok untuk perintah kerja ini"
    >
      {rows.length > 0 ? (
        <DetailTable>
          <DetailTableHead>
            <DetailTableTh>Barang</DetailTableTh>
            <DetailTableTh>Gudang</DetailTableTh>
            <DetailTableTh align="right">Direservasi</DetailTableTh>
            <DetailTableTh align="right">Terpakai</DetailTableTh>
            <DetailTableTh align="right">Sisa</DetailTableTh>
            <DetailTableTh>Status</DetailTableTh>
            <DetailTableTh>Dirilis</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((row) => (
              <DetailTableRow key={row.id}>
                <DetailTableTd>{row.itemName}</DetailTableTd>
                <DetailTableTd>{row.warehouseName}</DetailTableTd>
                <DetailTableTd align="right">{row.qtyReserved}</DetailTableTd>
                <DetailTableTd align="right">{row.qtyConsumed}</DetailTableTd>
                <DetailTableTd align="right">{row.remainingQty}</DetailTableTd>
                <DetailTableTd>{row.statusLabel}</DetailTableTd>
                <DetailTableTd>
                  {row.releasedAt
                    ? `${formatDate(row.releasedAt, { format: "numeric" })}${row.releasedByName ? ` oleh ${row.releasedByName}` : ""}${row.releaseReason ? ` — ${row.releaseReason}` : ""}`
                    : "-"}
                </DetailTableTd>
              </DetailTableRow>
            ))}
          </DetailTableBody>
        </DetailTable>
      ) : null}
      {unreserved.length > 0 ? (
        <div className={rows.length > 0 ? "mt-4" : undefined}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Kebutuhan tanpa reservasi
          </p>
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Barang</DetailTableTh>
              <DetailTableTh align="right">Sisa kebutuhan</DetailTableTh>
              <DetailTableTh>Status</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {unreserved.map((row, i) => (
                <DetailTableRow key={`${row.itemName}-${i}`}>
                  <DetailTableTd>{row.itemName}</DetailTableTd>
                  <DetailTableTd align="right">{row.remainingQty}</DetailTableTd>
                  <DetailTableTd>{row.statusLabel}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </div>
      ) : null}
    </ReportCardShell>
  )
}

