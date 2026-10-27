import Link from "next/link"

import type { ChequeOverdueQueue } from "@/lib/reports/cheque-overdue-queue"
import {
  CHEQUE_OVERDUE_COLUMN_LABELS,
  CHEQUE_OVERDUE_DIRECTIONS,
  CHEQUE_OVERDUE_DIRECTION_LABELS,
  CHEQUE_OVERDUE_EMPTY_TEXT,
  CHEQUE_OVERDUE_QUEUE_TITLE,
  CHEQUE_OVERDUE_TIERS,
  CHEQUE_OVERDUE_TIER_LABELS,
  CHEQUE_OVERDUE_TRUNCATED_LABEL,
  CHEQUE_UNKNOWN_STATUS_LABEL,
} from "@/lib/reports/cheque-overdue-queue"
import { formatAccounting, formatDate } from "@/lib/utils/format"
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
 * Seksi antrean Giro/Cek Lewat Jatuh Tempo Belum Cair
 * (F-2026-10-27-104-S, Q-CQ-3: seksi turunan di halaman register giro).
 *
 * Render verbatim payload server (AC-CQ-F1): umur, tingkat, urutan, dan
 * rekap datang dari builder; komponen ini tidak menghitung ulang apa
 * pun. Baca-saja (BR-CQ-07/AC-CQ-F2): tanpa tombol tulis apa pun;
 * tautan baris hanya ke register giro existing.
 */
export function ChequeOverdueQueueSection({
  queue,
}: Readonly<{ queue: ChequeOverdueQueue }>) {
  const labels = CHEQUE_OVERDUE_COLUMN_LABELS
  const isEmpty = queue.rows.length === 0 && queue.unknownStatusRows.length === 0

  return (
    <section
      aria-label={CHEQUE_OVERDUE_QUEUE_TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-col gap-1 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          {CHEQUE_OVERDUE_QUEUE_TITLE}
        </h2>
        <p className="text-xs text-muted-foreground">{queue.noticeText}</p>
        <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
          {CHEQUE_OVERDUE_DIRECTIONS.map((direction) => (
            <p key={direction}>
              {CHEQUE_OVERDUE_DIRECTION_LABELS[direction]}:{" "}
              {CHEQUE_OVERDUE_TIERS.map(
                (tier) =>
                  `${CHEQUE_OVERDUE_TIER_LABELS[tier]} ${queue.recap[direction][tier].count} · ${formatAccounting(queue.recap[direction][tier].nominalTercatat)}`,
              ).join(" · ")}
            </p>
          ))}
          {queue.unknownDirection.count > 0 ? (
            <p>
              Arah Tidak Dikenal: {queue.unknownDirection.count} ·{" "}
              {formatAccounting(queue.unknownDirection.nominalTercatat)}
            </p>
          ) : null}
          {queue.terpotong ? (
            <p className="font-medium text-foreground">
              {CHEQUE_OVERDUE_TRUNCATED_LABEL}: menampilkan {queue.rows.length} dari{" "}
              {queue.totalPopulation} lembar; rekap dari populasi penuh.
            </p>
          ) : null}
        </div>
      </div>

      {isEmpty ? (
        <EmptyState title={CHEQUE_OVERDUE_EMPTY_TEXT} className="py-6" />
      ) : (
        <div className="overflow-x-auto">
          <DetailTable data-report-table={CHEQUE_OVERDUE_QUEUE_TITLE}>
            <DetailTableHead>
              <DetailTableTh>{labels.dueDate}</DetailTableTh>
              <DetailTableTh>{labels.documentNo}</DetailTableTh>
              <DetailTableTh>{labels.type}</DetailTableTh>
              <DetailTableTh>{labels.number}</DetailTableTh>
              <DetailTableTh>{labels.party}</DetailTableTh>
              <DetailTableTh>{labels.direction}</DetailTableTh>
              <DetailTableTh>{labels.tier}</DetailTableTh>
              <DetailTableTh align="right">{labels.umurLewat}</DetailTableTh>
              <DetailTableTh align="right">{labels.nominalTercatat}</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {queue.rows.map((row) => (
                <DetailTableRow key={row.chequeId}>
                  <DetailTableTd>{formatDate(row.dueDate)}</DetailTableTd>
                  <DetailTableTd className="font-mono text-sm">
                    <Link href="/keuangan/giro" className="font-medium text-primary hover:underline">
                      {row.documentNo}
                    </Link>
                    {row.flags.map((flag) => (
                      <span key={flag} className="block text-xs font-medium text-destructive">
                        {flag}
                      </span>
                    ))}
                  </DetailTableTd>
                  <DetailTableTd>{row.typeLabel}</DetailTableTd>
                  <DetailTableTd className="font-mono text-sm">{row.number ?? "—"}</DetailTableTd>
                  <DetailTableTd>{row.party ?? "—"}</DetailTableTd>
                  <DetailTableTd>{row.directionLabel}</DetailTableTd>
                  <DetailTableTd>{row.tierLabel}</DetailTableTd>
                  <DetailTableTd align="right">{row.umurLewatLabel}</DetailTableTd>
                  <DetailTableTd align="right" className="tabular-nums">
                    {formatAccounting(row.amount)}
                  </DetailTableTd>
                </DetailTableRow>
              ))}
              {queue.unknownStatusRows.map((row) => (
                <DetailTableRow key={`unknown-${row.chequeId}`}>
                  <DetailTableTd>{formatDate(row.dueDate)}</DetailTableTd>
                  <DetailTableTd className="font-mono text-sm">
                    <Link href="/keuangan/giro" className="font-medium text-primary hover:underline">
                      {row.documentNo}
                    </Link>
                    <span className="block text-xs font-medium text-destructive">
                      {CHEQUE_UNKNOWN_STATUS_LABEL}: {row.status}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd>{row.type}</DetailTableTd>
                  <DetailTableTd className="font-mono text-sm">{row.number ?? "—"}</DetailTableTd>
                  <DetailTableTd>{row.party ?? "—"}</DetailTableTd>
                  <DetailTableTd>{row.direction}</DetailTableTd>
                  <DetailTableTd>{row.statusLabel}</DetailTableTd>
                  <DetailTableTd align="right">{row.umurLewatLabel}</DetailTableTd>
                  <DetailTableTd align="right" className="tabular-nums">
                    {formatAccounting(row.amount)}
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
