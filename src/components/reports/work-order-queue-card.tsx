import Link from "next/link"
import type { WorkOrderQueue } from "@/lib/reports/work-order-queue"
import { statusLabel } from "@/lib/utils/status-labels"
import { entityHref } from "@/lib/utils/entity-url"
import { formatDate } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { ReportCardShell } from "./report-card-shell"

/**
 * F-2026-10-20-28(a): papan antrian bengkel di daftar perintah kerja.
 *
 * Data dari loader read-only `getWorkOrderQueue`: WO aktif
 * (draft/pending/in_progress) urut tenggat `endDate`, bendera terlambat
 * bila `endDate` lewat hari ini. Inti F-28(b) (model Bay/teknisi) ditunda-
 * teknis; papan read-only ini default aktifnya. Komponen murni presentasi.
 */
export function WorkOrderQueueCard({ queue }: Readonly<{ queue: WorkOrderQueue }>) {
  return (
    <ReportCardShell
      label="Antrian Bengkel"
      title="Antrian Bengkel"
      summary={
        <>
          {queue.totalActive} perintah kerja aktif
          {queue.overdueCount > 0 ? ` · ${queue.overdueCount} terlambat` : ""}
        </>
      }
      isEmpty={queue.rows.length === 0}
      emptyText="Belum ada perintah kerja aktif dalam antrian"
    >
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>No. Dokumen</DetailTableTh>
              <DetailTableTh>Pelanggan</DetailTableTh>
              <DetailTableTh>Kendaraan</DetailTableTh>
              <DetailTableTh>Status</DetailTableTh>
              <DetailTableTh>Tenggat</DetailTableTh>
              <DetailTableTh align="right">Umur</DetailTableTh>
              <DetailTableTh>Keterlambatan</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {queue.rows.map((row) => (
                <DetailTableRow key={row.id}>
                  <DetailTableTd>
                    <Link
                      href={entityHref("/produksi/perintah-kerja", row)}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.documentNo}
                    </Link>
                  </DetailTableTd>
                  <DetailTableTd>{row.customerName ?? "—"}</DetailTableTd>
                  <DetailTableTd>{row.vehicleLabel ?? "—"}</DetailTableTd>
                  <DetailTableTd>{statusLabel(row.status)}</DetailTableTd>
                  <DetailTableTd>{row.endDate ? formatDate(row.endDate) : "—"}</DetailTableTd>
                  <DetailTableTd align="right">{row.ageDays} hari</DetailTableTd>
                  <DetailTableTd>
                    {row.isOverdue ? (
                      <span className="font-medium text-destructive">
                        Terlambat {row.overdueDays} hari
                      </span>
                    ) : (
                      "—"
                    )}
                  </DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
    </ReportCardShell>
  )
}
