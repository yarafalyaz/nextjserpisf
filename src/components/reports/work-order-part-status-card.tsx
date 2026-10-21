import type {
  WorkOrderPartStatus,
  WorkOrderPartStatusReport,
} from "@/lib/reports/work-order-part-status"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { ReportCardShell } from "./report-card-shell"

const STATUS_LABEL: Record<WorkOrderPartStatus, string> = {
  menunggu: "Menunggu",
  dipesan: "Dipesan",
  datang: "Datang",
  "terpasang-sebagian": "Terpasang sebagian",
  terpasang: "Terpasang",
  diganti: "Diganti",
  "tak-tertaut": "Jasa — tak-tertaut",
}

const STATUS_ORDER: WorkOrderPartStatus[] = [
  "menunggu",
  "dipesan",
  "datang",
  "terpasang-sebagian",
  "terpasang",
  "diganti",
  "tak-tertaut",
]

function rowName(
  row: WorkOrderPartStatusReport["rows"][number],
  nameByItemId: ReadonlyMap<number, string>,
): string {
  if (row.description) return row.description
  return nameByItemId.get(row.itemId) ?? `Barang #${row.itemId}`
}

/**
 * F-2026-10-20-105 (tahap frontend): kartu Status Part per baris WO.
 *
 * Data dari loader read-only `getWorkOrderPartStatus` (builder
 * `buildWorkOrderPartStatus`, PR #275): precedence
 * diganti>terpasang>sebagian>datang>dipesan>menunggu, jasa tak-tertaut,
 * retur tak diturunkan. Komponen ini murni presentasi — tidak menghitung
 * ulang status, tidak menulis WorkOrderItem.status; notice backend tampil
 * apa adanya.
 */
export function WorkOrderPartStatusCard({
  report,
  nameByItemId,
}: Readonly<{
  report: WorkOrderPartStatusReport
  nameByItemId: ReadonlyMap<number, string>
}>) {
  const total = report.rows.length
  return (
    <ReportCardShell
      label="Status Part Perintah Kerja"
      title="Status Part Perintah Kerja"
      summary={<>{total} baris perintah kerja</>}
      isEmpty={total === 0}
      emptyText="Belum ada baris part untuk perintah kerja ini"
    >
      <DetailTable>
        <DetailTableHead>
          <DetailTableTh>Baris</DetailTableTh>
          <DetailTableTh align="right">Butuh</DetailTableTh>
          <DetailTableTh align="right">Keluar</DetailTableTh>
          <DetailTableTh align="right">Dipesan</DetailTableTh>
          <DetailTableTh align="right">Diterima</DetailTableTh>
          <DetailTableTh>Status</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          {report.rows.map((row) => (
            <DetailTableRow key={row.workOrderItemId}>
              <DetailTableTd>{rowName(row, nameByItemId)}</DetailTableTd>
              <DetailTableTd align="right">{row.qty}</DetailTableTd>
              <DetailTableTd align="right">{row.issuedQty}</DetailTableTd>
              <DetailTableTd align="right">{row.orderedQty}</DetailTableTd>
              <DetailTableTd align="right">{row.receivedQty}</DetailTableTd>
              <DetailTableTd>{STATUS_LABEL[row.status]}</DetailTableTd>
            </DetailTableRow>
          ))}
        </DetailTableBody>
      </DetailTable>
      <section aria-label="Ringkasan status part" className="mt-5">
        <h3 className="text-sm font-semibold text-foreground">Ringkasan Status</h3>
        <DetailTable>
          <DetailTableHead>
            <DetailTableTh>Status</DetailTableTh>
            <DetailTableTh align="right">Jumlah Baris</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {STATUS_ORDER.filter((status) => report.counts[status] > 0).map(
              (status) => (
                <DetailTableRow key={status}>
                  <DetailTableTd>{STATUS_LABEL[status]}</DetailTableTd>
                  <DetailTableTd align="right">{report.counts[status]}</DetailTableTd>
                </DetailTableRow>
              ),
            )}
          </DetailTableBody>
        </DetailTable>
      </section>
      <p className="mt-4 text-sm text-muted-foreground">{report.notice}</p>
    </ReportCardShell>
  )
}
