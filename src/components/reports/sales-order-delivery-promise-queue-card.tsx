import Link from "next/link"
import type {
  SalesOrderDeliveryPromiseQueue,
  SoDeliveryPromiseBucket,
} from "@/lib/reports/sales-order-delivery-promise-queue"
import { SO_DELIVERY_PROMISE_QUEUE_NOTICE_TEXT } from "@/lib/reports/sales-order-delivery-promise-queue"
import { entityHref } from "@/lib/utils/entity-url"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"

const BUCKET_TONES: Record<
  SoDeliveryPromiseBucket,
  "danger" | "warning" | "accent"
> = {
  overdue: "danger",
  due_today: "warning",
  due_soon: "accent",
}

const TITLE = "Antrean Janji Kirim Pesanan Penjualan"

/**
 * F-2026-10-25-029-S: antrean janji kirim SO mendekati/lewat belum terkirim
 * penuh. Ember/sisa hari/nilai/totals dari builder server apa adanya; UI
 * tidak menghitung ulang (nol reduce/filter/sort). Baca-saja total: tanpa
 * tombol/radio/checkbox/form/ekspor — tindak lanjut hanya tautan detail SO
 * existing. Penanda tanpa-janji = angka terpisah, bukan baris.
 */
export function SalesOrderDeliveryPromiseQueueCard({
  queue,
  withoutPromiseCount,
}: Readonly<{
  queue: SalesOrderDeliveryPromiseQueue
  withoutPromiseCount: number
}>) {
  return (
    <section
      aria-label={TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">{TITLE}</h2>
      </div>
      <div className="p-4 px-5">
        <p className="text-xs text-muted-foreground">
          {queue.totalDocuments} pesanan penjualan dalam antrean · Nilai sisa{" "}
          {formatCurrency(queue.totalOutstandingValue)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {SO_DELIVERY_PROMISE_QUEUE_NOTICE_TEXT}
        </p>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {queue.totals.map((total) => (
            <div key={total.bucket} className="flex items-baseline gap-2">
              <dt>
                <StatusChip
                  status={total.bucket}
                  customLabel={total.bucketLabel}
                  customTone={BUCKET_TONES[total.bucket]}
                />
              </dt>
              <dd className="text-xs text-muted-foreground">
                {total.documents} dokumen · {formatCurrency(total.outstandingValue)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          {withoutPromiseCount} pesanan penjualan tanpa tanggal janji kirim
          (penanda kualitas data, bukan baris antrean)
        </p>
        {queue.rows.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            Belum ada pesanan penjualan yang janji kirimnya mendekati atau sudah
            lewat
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>No. Pesanan</DetailTableTh>
                <DetailTableTh>Pelanggan</DetailTableTh>
                <DetailTableTh>Penjual</DetailTableTh>
                <DetailTableTh>Tanggal</DetailTableTh>
                <DetailTableTh>Status</DetailTableTh>
                <DetailTableTh>Janji Kirim</DetailTableTh>
                <DetailTableTh align="right">Sisa Hari</DetailTableTh>
                <DetailTableTh align="right">Baris Sisa</DetailTableTh>
                <DetailTableTh align="right">Nilai Sisa</DetailTableTh>
                <DetailTableTh>Ember</DetailTableTh>
                <DetailTableTh>Aksi</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {queue.rows.map((row) => (
                  <DetailTableRow key={row.salesOrderId}>
                    <DetailTableTd>{row.documentNo}</DetailTableTd>
                    <DetailTableTd>{row.customerName}</DetailTableTd>
                    <DetailTableTd>{row.salesEmployeeName ?? "—"}</DetailTableTd>
                    <DetailTableTd>{formatDate(row.date)}</DetailTableTd>
                    <DetailTableTd>
                      <StatusChip status={row.status} />
                    </DetailTableTd>
                    <DetailTableTd>{formatDate(row.deliveryDate)}</DetailTableTd>
                    <DetailTableTd align="right">{row.daysUntilDue}</DetailTableTd>
                    <DetailTableTd align="right">{row.linesRemaining}</DetailTableTd>
                    <DetailTableTd align="right">
                      {formatCurrency(row.outstandingValue)}
                    </DetailTableTd>
                    <DetailTableTd>
                      <StatusChip
                        status={row.bucket}
                        customLabel={row.bucketLabel}
                        customTone={BUCKET_TONES[row.bucket]}
                      />
                    </DetailTableTd>
                    <DetailTableTd>
                      <Link
                        href={entityHref("/penjualan/pesanan", {
                          id: row.salesOrderId,
                          slug: row.slug,
                        })}
                        className="inline-flex min-h-11 items-center font-medium text-primary hover:underline sm:min-h-9"
                      >
                        Buka Pesanan
                      </Link>
                    </DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          </div>
        )}
      </div>
    </section>
  )
}
