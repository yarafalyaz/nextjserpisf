import type {
  DeliveredUnbilledQueue,
  DeliveredUnbilledRow,
} from "@/lib/reports/delivered-unbilled"
import {
  DELIVERED_UNBILLED_EMPTY_TEXT,
  DELIVERED_UNBILLED_NOTICE_TEXT,
} from "@/lib/reports/delivered-unbilled"
import { entityHref } from "@/lib/utils/entity-url"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { ReportCardShell } from "./report-card-shell"

export const DELIVERED_UNBILLED_TITLE = "Terkirim Belum Terfaktur"

/**
 * F-2026-10-26-058-S: antrean SO terkirim belum terfaktur penuh.
 * Angka/totals/urutan dari payload loader server apa adanya; UI tidak
 * menghitung ulang (nol reduce/filter/sort). Baca-saja total: tanpa
 * tombol/form/ekspor — tindak lanjut hanya tautan detail SO existing.
 */
export function DeliveredUnbilledQueueCard({
  queue,
}: Readonly<{ queue: DeliveredUnbilledQueue }>) {
  return (
    <ReportCardShell
      label={DELIVERED_UNBILLED_TITLE}
      title={DELIVERED_UNBILLED_TITLE}
      summary={
        <>
          {queue.totalDocuments} pesanan penjualan · Terkirim{" "}
          {formatCurrency(queue.totalDeliveredValue)} · Terfaktur{" "}
          {formatCurrency(queue.totalBilledValue)} · Belum Terfaktur{" "}
          {formatCurrency(queue.totalUnbilledValue)}
        </>
      }
      isEmpty={queue.rows.length === 0}
      emptyText={DELIVERED_UNBILLED_EMPTY_TEXT}
      notice={DELIVERED_UNBILLED_NOTICE_TEXT}
    >
      <div className="mt-3 overflow-x-auto">
        <DetailTable>
          <DetailTableHead>
            <DetailTableTh>No. Pesanan</DetailTableTh>
            <DetailTableTh>Pelanggan</DetailTableTh>
            <DetailTableTh>Tanggal Pesanan</DetailTableTh>
            <DetailTableTh>Pengiriman Terakhir</DetailTableTh>
            <DetailTableTh align="right">Umur</DetailTableTh>
            <DetailTableTh align="right">Nilai Terkirim</DetailTableTh>
            <DetailTableTh align="right">Nilai Terfaktur</DetailTableTh>
            <DetailTableTh align="right">Belum Terfaktur</DetailTableTh>
            <DetailTableTh>Tindakan</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {queue.rows.map((row: DeliveredUnbilledRow) => (
              <DetailTableRow key={row.salesOrderId}>
                <DetailTableTd>{row.documentNo}</DetailTableTd>
                <DetailTableTd>{row.customerName}</DetailTableTd>
                <DetailTableTd>{formatDate(row.date)}</DetailTableTd>
                <DetailTableTd>{formatDate(row.lastDeliveryAt)}</DetailTableTd>
                <DetailTableTd align="right">{row.ageDays} hari</DetailTableTd>
                <DetailTableTd align="right">
                  {formatCurrency(row.deliveredValue)}
                </DetailTableTd>
                <DetailTableTd align="right">
                  {formatCurrency(row.billedValue)}
                </DetailTableTd>
                <DetailTableTd align="right">
                  {formatCurrency(row.unbilledValue)}
                </DetailTableTd>
                <DetailTableTd>
                  <a
                    href={entityHref("/penjualan/pesanan", {
                      id: row.salesOrderId,
                      slug: row.slug,
                    })}
                    className="inline-flex min-h-11 items-center font-medium text-primary hover:underline sm:min-h-9"
                  >
                    Buka Pesanan
                  </a>
                </DetailTableTd>
              </DetailTableRow>
            ))}
          </DetailTableBody>
        </DetailTable>
      </div>
    </ReportCardShell>
  )
}
