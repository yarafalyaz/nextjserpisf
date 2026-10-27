import Link from "next/link"

import type {
  BankStatementDraftBucket,
  BankStatementDraftQueue,
} from "@/lib/reports/bank-statement-draft-queue"
import {
  BANK_STATEMENT_DRAFT_BUCKETS,
  BANK_STATEMENT_DRAFT_BUCKET_LABELS,
  BANK_STATEMENT_DRAFT_LEVELS,
  BANK_STATEMENT_DRAFT_LEVEL_LABELS,
  BANK_STATEMENT_DRAFT_QUEUE_COLUMN_LABELS,
  BANK_STATEMENT_DRAFT_QUEUE_EMPTY_TEXT,
  BANK_STATEMENT_DRAFT_QUEUE_TITLE,
  BANK_STATEMENT_DRAFT_QUEUE_TRUNCATED_LABEL,
} from "@/lib/reports/bank-statement-draft-queue"
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
 * Seksi antrean Rekening Koran Draft Mengendap
 * (F-2026-10-27-096-S, Q-BSQ-3: seksi turunan di halaman
 * /keuangan/laporan-bank existing).
 *
 * Render verbatim payload server (AC-BSQ-F1): umur, tingkat, ember,
 * hitungan baris/sisa, dan nominal tercatat datang dari builder;
 * komponen ini tidak menghitung ulang apa pun. Baca-saja: tanpa
 * tombol tulis apa pun; tautan baris hanya ke detail rekening koran
 * existing (AC-BSQ-F2/F3). Dua ember tampil sebagai seksi terpisah.
 */
export function BankStatementDraftQueueSection({
  queue,
}: Readonly<{ queue: BankStatementDraftQueue }>) {
  const labels = BANK_STATEMENT_DRAFT_QUEUE_COLUMN_LABELS

  return (
    <section
      aria-label={BANK_STATEMENT_DRAFT_QUEUE_TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-col gap-1 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          {BANK_STATEMENT_DRAFT_QUEUE_TITLE}
        </h2>
        <p className="text-xs text-muted-foreground">{queue.noticeText}</p>
        <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
          {BANK_STATEMENT_DRAFT_BUCKETS.map((bucket) => (
            <p key={bucket}>
              {BANK_STATEMENT_DRAFT_BUCKET_LABELS[bucket]}: {queue.bucketCounts[bucket]}
            </p>
          ))}
          <p>
            {BANK_STATEMENT_DRAFT_LEVELS.map(
              (level) =>
                `${BANK_STATEMENT_DRAFT_LEVEL_LABELS[level]} ${queue.levelCounts[level]}`,
            ).join(" · ")}
          </p>
          {queue.terpotong ? (
            <p className="font-medium text-foreground">
              {BANK_STATEMENT_DRAFT_QUEUE_TRUNCATED_LABEL}: menampilkan {queue.rows.length} dari{" "}
              {queue.totalPopulation} rekening koran; rekap dari populasi penuh.
            </p>
          ) : null}
        </div>
      </div>

      {queue.rows.length === 0 ? (
        <EmptyState title={BANK_STATEMENT_DRAFT_QUEUE_EMPTY_TEXT} className="py-6" />
      ) : (
        BANK_STATEMENT_DRAFT_BUCKETS.map((bucket: BankStatementDraftBucket) => {
          const bucketRows = queue.rows.filter((row) => row.ember === bucket)
          if (bucketRows.length === 0) return null
          return (
            <div key={bucket} className="border-b border-default last:border-b-0">
              <h3 className="px-5 pt-4 text-[0.8125rem] font-semibold text-foreground">
                {BANK_STATEMENT_DRAFT_BUCKET_LABELS[bucket]} ({queue.bucketCounts[bucket]})
              </h3>
              <div className="overflow-x-auto">
                <DetailTable data-report-table={BANK_STATEMENT_DRAFT_BUCKET_LABELS[bucket]}>
                  <DetailTableHead>
                    <DetailTableTh>{labels.account}</DetailTableTh>
                    <DetailTableTh>{labels.date}</DetailTableTh>
                    <DetailTableTh>{labels.reference}</DetailTableTh>
                    <DetailTableTh>{labels.period}</DetailTableTh>
                    <DetailTableTh>{labels.baris}</DetailTableTh>
                    <DetailTableTh align="right">{labels.umur}</DetailTableTh>
                    <DetailTableTh>{labels.tingkat}</DetailTableTh>
                    <DetailTableTh align="right">{labels.nominalTercatat}</DetailTableTh>
                    <DetailTableTh>{labels.uploadedBy}</DetailTableTh>
                  </DetailTableHead>
                  <DetailTableBody>
                    {bucketRows.map((row) => (
                      <DetailTableRow key={row.statementId}>
                        <DetailTableTd className="font-mono text-sm">
                          <Link
                            href={entityHref("/keuangan/laporan-bank", {
                              id: row.statementId,
                              slug: row.slug,
                            })}
                            className="font-medium text-primary hover:underline"
                          >
                            {row.accountName
                              ? `${row.accountCode ?? ""} ${row.accountName}`.trim()
                              : `No. Rekening ${row.accountNumber ?? row.accountId}`}
                          </Link>
                          {row.accountNumber ? (
                            <span className="block text-xs text-muted-foreground">
                              {row.accountNumber}
                            </span>
                          ) : null}
                        </DetailTableTd>
                        <DetailTableTd>{formatDate(row.date)}</DetailTableTd>
                        <DetailTableTd>{row.reference ?? "—"}</DetailTableTd>
                        <DetailTableTd>
                          {row.periodStart || row.periodEnd
                            ? `${row.periodStart ? formatDate(row.periodStart) : "—"} – ${row.periodEnd ? formatDate(row.periodEnd) : "—"}`
                            : "—"}
                        </DetailTableTd>
                        <DetailTableTd>
                          {row.totalLineCount} baris · tercocokkan {row.matchedLineCount} · sisa{" "}
                          {row.remainingLineCount}
                          <span className="block text-xs text-muted-foreground">
                            {row.emberLabel}
                          </span>
                        </DetailTableTd>
                        <DetailTableTd align="right">{row.umurLabel}</DetailTableTd>
                        <DetailTableTd>{row.tingkatLabel}</DetailTableTd>
                        <DetailTableTd align="right" className="tabular-nums">
                          {formatAccounting(row.openingBalance)} /{" "}
                          {formatAccounting(row.closingBalance)}
                          <span className="block text-xs text-muted-foreground">
                            Debit {formatAccounting(row.totalDebits)} · Kredit{" "}
                            {formatAccounting(row.totalCredits)} · {row.nominalLabel}
                          </span>
                        </DetailTableTd>
                        <DetailTableTd>{row.uploadedByName ?? "—"}</DetailTableTd>
                      </DetailTableRow>
                    ))}
                  </DetailTableBody>
                </DetailTable>
              </div>
            </div>
          )
        })
      )}
    </section>
  )
}
