import Link from "next/link"

import type { WorkOrderOperationQueue } from "@/lib/reports/work-order-operation-queue"
import {
  WORK_ORDER_OPERATION_COLUMN_LABELS,
  WORK_ORDER_OPERATION_LEVEL_LABELS,
  WORK_ORDER_OPERATION_MARKERS,
  WORK_ORDER_OPERATION_QUEUE_EMPTY_TEXT,
  WORK_ORDER_OPERATION_QUEUE_TITLE,
  WORK_ORDER_OPERATION_STATUS_LABELS,
  WORK_ORDER_OPERATION_TRUNCATED_LABEL,
} from "@/lib/reports/work-order-operation-queue"
import { entityHref } from "@/lib/utils/entity-url"
import { formatDate } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableBody,
  DetailTableHead,
  DetailTableRow,
  DetailTableTd,
  DetailTableTh,
} from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"

/**
 * Seksi antrean Operasi Perintah Kerja Mengendap (F-2026-10-27-100-S,
 * Q-WOOQ-3: seksi turunan di halaman perintah kerja existing).
 *
 * Render verbatim payload server (AC-WOOQ-F1): umur, sumber umur,
 * tingkat, penanda, urutan, dan rekap datang dari builder — komponen
 * ini tidak menghitung ulang apa pun. Baca-saja (AC-WOOQ-F2): tanpa
 * tombol tulis apa pun; tautan baris hanya ke detail WO existing.
 * Baris tertanda tampil dengan tandanya (AC-WOOQ-F3).
 */
export function WorkOrderOperationQueueSection({
  queue,
}: Readonly<{ queue: WorkOrderOperationQueue }>) {
  const labels = WORK_ORDER_OPERATION_COLUMN_LABELS

  return (
    <section
      aria-label={WORK_ORDER_OPERATION_QUEUE_TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-col gap-1 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          {WORK_ORDER_OPERATION_QUEUE_TITLE}
        </h2>
        <p className="text-xs text-muted-foreground">{queue.noticeText}</p>
        <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
          <p>
            {`${WORK_ORDER_OPERATION_LEVEL_LABELS.MENGENDAP} ${queue.levelCounts.MENGENDAP} · ${WORK_ORDER_OPERATION_LEVEL_LABELS.BERJALAN} ${queue.levelCounts.BERJALAN}`}
            {queue.tanpaUmurCount > 0
              ? ` · ${WORK_ORDER_OPERATION_MARKERS.MULAI_TANPA_STEMPEL} ${queue.tanpaUmurCount}`
              : ""}
          </p>
          <p>
            {`${WORK_ORDER_OPERATION_STATUS_LABELS.pending} ${queue.statusCounts.pending} · ${WORK_ORDER_OPERATION_STATUS_LABELS.in_progress} ${queue.statusCounts.in_progress}`}
          </p>
          {queue.stationRecap.length > 0 ? (
            <p>
              Stasiun:{" "}
              {queue.stationRecap
                .map((recap) => `${recap.workCenterLabel} ${recap.count}`)
                .join(" · ")}
            </p>
          ) : null}
          {queue.terpotong ? (
            <p className="font-medium text-foreground">
              {WORK_ORDER_OPERATION_TRUNCATED_LABEL}: menampilkan {queue.rows.length} dari{" "}
              {queue.totalPopulation} operasi; rekap dari populasi penuh.
            </p>
          ) : null}
        </div>
      </div>

      {queue.rows.length === 0 ? (
        <EmptyState title={WORK_ORDER_OPERATION_QUEUE_EMPTY_TEXT} className="py-6" />
      ) : (
        <div className="overflow-x-auto">
          <DetailTable data-report-table={WORK_ORDER_OPERATION_QUEUE_TITLE}>
            <DetailTableHead>
              <DetailTableTh>{labels.operation}</DetailTableTh>
              <DetailTableTh>{labels.workOrder}</DetailTableTh>
              <DetailTableTh>{labels.workOrderStatus}</DetailTableTh>
              <DetailTableTh>{labels.status}</DetailTableTh>
              <DetailTableTh>{labels.umur}</DetailTableTh>
              <DetailTableTh>{labels.sumberUmur}</DetailTableTh>
              <DetailTableTh>{labels.tingkat}</DetailTableTh>
              <DetailTableTh>{labels.workCenter}</DetailTableTh>
              <DetailTableTh>{labels.assignee}</DetailTableTh>
              <DetailTableTh>{labels.estimatedHours}</DetailTableTh>
              <DetailTableTh>{labels.endDate}</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {queue.rows.map((row) => (
                <DetailTableRow key={row.operationId}>
                  <DetailTableTd>
                    <Link
                      href={entityHref("/produksi/perintah-kerja", {
                        id: row.workOrderId,
                        slug: row.workOrderSlug,
                      })}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.name}
                    </Link>
                    {row.flags.map((flag) => (
                      <span key={flag} className="block text-xs font-medium text-destructive">
                        {flag}
                        {flag === WORK_ORDER_OPERATION_MARKERS.TERHALANG_TAHAP_SEBELUMNYA &&
                        row.blockedByName
                          ? `: ${row.blockedByName}`
                          : ""}
                      </span>
                    ))}
                  </DetailTableTd>
                  <DetailTableTd>{row.documentNo}</DetailTableTd>
                  <DetailTableTd>{row.workOrderStatus}</DetailTableTd>
                  <DetailTableTd>{row.statusLabel}</DetailTableTd>
                  <DetailTableTd>{row.umurLabel}</DetailTableTd>
                  <DetailTableTd>{row.sumberUmur}</DetailTableTd>
                  <DetailTableTd>{row.tingkatLabel}</DetailTableTd>
                  <DetailTableTd>{row.workCenterLabel}</DetailTableTd>
                  <DetailTableTd>{row.assigneeLabel}</DetailTableTd>
                  <DetailTableTd>
                    {row.estimatedHours === null ? "—" : row.estimatedHours}
                  </DetailTableTd>
                  <DetailTableTd>
                    {row.workOrderEndDate ? formatDate(row.workOrderEndDate) : "—"}
                  </DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </div>
      )}
    </section>
  )
}
