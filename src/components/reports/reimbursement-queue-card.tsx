import Link from "next/link"
import {
  Receipt,
  ExternalLink,
} from "@/components/ui/fontawesome-icons"

import type {
  ReimbursementQueue,
  ReimbursementQueueLevel,
  ReimbursementQueueRow,
} from "@/lib/reports/reimbursement-queue"
import { entityHref } from "@/lib/utils/entity-url"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"

const LEVEL_TONES: Record<ReimbursementQueueLevel, "danger" | "warning"> = {
  mengendap: "danger",
  menunggu: "warning",
}

function QueueTable({ rows }: Readonly<{ rows: ReimbursementQueueRow[] }>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <DetailTable>
        <DetailTableHead>
          <DetailTableTh>No. Dokumen</DetailTableTh>
          <DetailTableTh>Pengaju</DetailTableTh>
          <DetailTableTh>Tahap</DetailTableTh>
          <DetailTableTh>Tingkat</DetailTableTh>
          <DetailTableTh>Tanggal Jurnal Akrual</DetailTableTh>
          <DetailTableTh align="right">Menunggu</DetailTableTh>
          <DetailTableTh align="right">Nominal Tersimpan</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          {rows.map((row) => (
            <DetailTableRow key={row.claimId} className="hover:bg-muted/40 transition-colors">
              <DetailTableTd>
                <Link
                  href={entityHref("/keuangan/pengeluaran", {
                    id: row.claimId,
                    slug: row.slug,
                  })}
                  className="inline-flex min-h-11 items-center gap-1.5 font-medium text-primary hover:underline sm:min-h-9"
                  title="Buka dokumen pengeluaran"
                >
                  <Receipt className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  <span>{row.documentNo}</span>
                  <ExternalLink className="size-3 text-muted-foreground/60" aria-hidden="true" />
                </Link>
              </DetailTableTd>
              <DetailTableTd>
                {row.employeeName ? (
                  <span className="font-medium text-foreground">{row.employeeName}</span>
                ) : (
                  <span className="text-muted-foreground">Belum ada pengaju tercatat</span>
                )}
              </DetailTableTd>
              <DetailTableTd>
                <StatusChip status={row.stage} customLabel={row.stageLabel} customTone="warning" />
              </DetailTableTd>
              <DetailTableTd>
                <StatusChip
                  status={row.level}
                  customLabel={row.levelLabel}
                  customTone={LEVEL_TONES[row.level]}
                />
              </DetailTableTd>
              <DetailTableTd>
                {row.accrualJournalDate ? (
                  <span className="font-mono text-xs tabular-nums">{formatDate(row.accrualJournalDate)}</span>
                ) : (
                  <span className="text-muted-foreground">{row.noAccrualLabel}</span>
                )}
              </DetailTableTd>
              <DetailTableTd align="right">
                <span className="font-medium tabular-nums">
                  {row.waitingDays === null ? "-" : `${row.waitingDays} hari`}
                </span>
              </DetailTableTd>
              <DetailTableTd align="right">
                <span className="font-semibold text-foreground font-mono tabular-nums">
                  {formatCurrencyExact(row.amount)}
                </span>
              </DetailTableTd>
            </DetailTableRow>
          ))}
        </DetailTableBody>
      </DetailTable>
    </div>
  )
}

/**
 * Antrean Reimbursement Disetujui — Menunggu Pembayaran (F-2026-10-27-082-S).
 *
 * Seluruh kata, tahap, tingkat, umur, hitungan, dan total verbatim payload
 * `buildReimbursementQueue` — UI tidak menghitung ulang (AC-RBQ-F1).
 * Sub-ember paid-tanpa-jurnal tampil default sebagai seksi terpisah
 * terhitung (Q-RBQ-6, AC-RBQ-F2). Baca-saja: nol tombol Setujui/Bayar/Tolak;
 * satu-satunya jalan aksi = detail klaim existing (AC-RBQ-F3, BR-RBQ-09).
 */
export function ReimbursementQueueCard({ queue }: Readonly<{ queue: ReimbursementQueue }>) {
  const hasItems = queue.rows.length > 0 || queue.paidWithoutJournalRows.length > 0

  return (
    <div className="flex flex-col gap-5">
      {/* KPI & Summary Bar: Clean, Purpose-Driven ERP Metric Strip */}
      <div className="grid grid-cols-1 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card sm:grid-cols-2 lg:grid-cols-4 shadow-2xs">
        {/* Total Klaim */}
        <div className="p-4 sm:p-5">
          <p className="text-xs font-medium text-muted-foreground">Total Klaim Antrean</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {queue.totalClaims} <span className="text-sm font-normal text-muted-foreground">klaim</span>
          </p>
        </div>

        {/* Mengendap */}
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-red-600 dark:bg-red-500" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Mengendap (&gt;= 3 Hari)</p>
          </div>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {queue.levelCounts.mengendap}
            {queue.levelCounts.mengendap > 0 && (
              <span className="ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                Prioritas
              </span>
            )}
          </p>
        </div>

        {/* Menunggu */}
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-amber-500 dark:bg-amber-400" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Menunggu (&lt; 3 Hari)</p>
          </div>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {queue.levelCounts.menunggu}
          </p>
        </div>

        {/* Total Nominal Tersimpan */}
        <div className="p-4 sm:p-5">
          <p className="text-xs font-medium text-muted-foreground truncate" title={queue.totalLabel}>
            {queue.totalLabel}
          </p>
          <p className="mt-2 text-xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatCurrencyExact(queue.totalStoredAmount)}
          </p>
        </div>
      </div>

      {/* Main Table Section */}
      <section
        aria-label={queue.title}
        className="rounded-lg border border-border bg-card shadow-2xs overflow-hidden"
      >
        <div className="flex flex-col gap-1.5 p-4 px-5 border-b border-border bg-muted/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground sm:text-base">{queue.title}</h2>
          </div>
          <p className="text-xs text-muted-foreground text-pretty max-w-4xl">{queue.noticeText}</p>
        </div>

        <div className="p-4 px-5">
          {!hasItems ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <p className="text-sm font-medium">
                Belum ada klaim reimbursement disetujui yang menunggu pembayaran
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Klaim yang telah disetujui oleh atasan / SDM akan tercatat di antrean ini untuk proses kasir.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {queue.rows.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <p className="text-sm">Belum ada klaim reimbursement disetujui yang menunggu pembayaran</p>
                </div>
              ) : (
                <QueueTable rows={queue.rows} />
              )}

              {queue.paidWithoutJournalRows.length > 0 && (
                <section aria-label={queue.paidWithoutJournalLabel} className="pt-4 border-t border-border">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="size-2 rounded-full bg-amber-500" aria-hidden="true" />
                    <h3 className="text-sm font-semibold text-foreground">
                      {queue.paidWithoutJournalLabel} ({queue.paidWithoutJournalRows.length})
                    </h3>
                  </div>
                  <QueueTable rows={queue.paidWithoutJournalRows} />
                </section>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
