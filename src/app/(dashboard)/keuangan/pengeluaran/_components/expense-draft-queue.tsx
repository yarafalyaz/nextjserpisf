import Link from "next/link"

import type { ExpenseDraftQueue } from "@/lib/reports/expense-draft-queue"
import {
  EXPENSE_DRAFT_APPROVAL_BUCKETS,
  EXPENSE_DRAFT_APPROVAL_BUCKET_LABELS,
  EXPENSE_DRAFT_LEVELS,
  EXPENSE_DRAFT_LEVEL_LABELS,
  EXPENSE_DRAFT_QUEUE_COLUMN_LABELS,
  EXPENSE_DRAFT_QUEUE_EMPTY_TEXT,
  EXPENSE_DRAFT_QUEUE_TITLE,
  EXPENSE_DRAFT_QUEUE_TRUNCATED_LABEL,
} from "@/lib/reports/expense-draft-queue"
import { formatAccounting, formatDate } from "@/lib/utils/format"
import { entityHref } from "@/lib/utils/entity-url"
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
 * Seksi antrean Pengeluaran Menunggu Persetujuan
 * (F-2026-10-27-107-S, Q-EXQ-5: seksi turunan di halaman
 * pengeluaran existing).
 *
 * Render verbatim payload server (AC-EXQ-F1): umur, tingkat, ember,
 * penanda klaim, dan rekap datang dari builder; komponen ini tidak
 * menghitung ulang apa pun. Baca-saja: tanpa tombol tulis apa pun;
 * tautan baris hanya ke detail pengeluaran existing (AC-EXQ-F2).
 * Ember workflow selesai tampil terpisah terhitung (AC-EXQ-F3).
 */
export function ExpenseDraftQueueSection({
  queue,
}: Readonly<{ queue: ExpenseDraftQueue }>) {
  const labels = EXPENSE_DRAFT_QUEUE_COLUMN_LABELS

  return (
    <section
      aria-label={EXPENSE_DRAFT_QUEUE_TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-col gap-1 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          {EXPENSE_DRAFT_QUEUE_TITLE}
        </h2>
        <p className="text-xs text-muted-foreground">{queue.noticeText}</p>
        <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
          {EXPENSE_DRAFT_APPROVAL_BUCKETS.map((bucket) => (
            <p key={bucket}>
              {EXPENSE_DRAFT_APPROVAL_BUCKET_LABELS[bucket]}:{" "}
              {queue.bucketRecap[bucket].count} ·{" "}
              {formatAccounting(queue.bucketRecap[bucket].totalAmount)}
            </p>
          ))}
          <p>
            {EXPENSE_DRAFT_LEVELS.map(
              (level) =>
                `${EXPENSE_DRAFT_LEVEL_LABELS[level]} ${queue.levelCounts[level]}`,
            ).join(" · ")}
          </p>
          <p>
            {queue.totalLabel}: {queue.displayedCount} baris ·{" "}
            {formatAccounting(queue.totalNominalBarisTampil)}
          </p>
          {queue.terpotong ? (
            <p className="font-medium text-foreground">
              {EXPENSE_DRAFT_QUEUE_TRUNCATED_LABEL}: menampilkan {queue.rows.length} dari{" "}
              {queue.totalPopulation} pengeluaran; rekap dari populasi penuh.
            </p>
          ) : null}
        </div>
      </div>

      {queue.rows.length === 0 ? (
        <EmptyState title={EXPENSE_DRAFT_QUEUE_EMPTY_TEXT} className="py-6" />
      ) : (
        <div className="overflow-x-auto">
          <DetailTable data-report-table={EXPENSE_DRAFT_QUEUE_TITLE}>
            <DetailTableHead>
              <DetailTableTh>{labels.documentNo}</DetailTableTh>
              <DetailTableTh>{labels.description}</DetailTableTh>
              <DetailTableTh>{labels.category}</DetailTableTh>
              <DetailTableTh>{labels.vendor}</DetailTableTh>
              <DetailTableTh>{labels.project}</DetailTableTh>
              <DetailTableTh>{labels.claim}</DetailTableTh>
              <DetailTableTh align="right">{labels.amount}</DetailTableTh>
              <DetailTableTh align="right">{labels.umurMenunggu}</DetailTableTh>
              <DetailTableTh>{labels.tingkat}</DetailTableTh>
              <DetailTableTh>{labels.keadaanPersetujuan}</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {queue.rows.map((row) => (
                <DetailTableRow key={row.expenseId}>
                  <DetailTableTd className="font-mono text-sm">
                    <Link
                      href={entityHref("/keuangan/pengeluaran", {
                        id: row.expenseId,
                        slug: row.slug,
                      })}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.documentNo}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {formatDate(row.date)}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd>{row.description ?? "—"}</DetailTableTd>
                  <DetailTableTd>{row.categoryName ?? "—"}</DetailTableTd>
                  <DetailTableTd>{row.vendorName ?? "—"}</DetailTableTd>
                  <DetailTableTd>{row.projectName ?? "—"}</DetailTableTd>
                  <DetailTableTd>
                    {row.claimLabel ? (
                      <>
                        {row.claimLabel}
                        {row.employeeName ? (
                          <span className="block text-xs text-muted-foreground">
                            {row.employeeName}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </DetailTableTd>
                  <DetailTableTd align="right" className="tabular-nums">
                    {formatAccounting(row.amount)}
                  </DetailTableTd>
                  <DetailTableTd align="right">{row.umurMenungguLabel}</DetailTableTd>
                  <DetailTableTd>{row.tingkatLabel}</DetailTableTd>
                  <DetailTableTd>{row.keadaanPendampingLabel}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </div>
      )}
    </section>
  )
}
