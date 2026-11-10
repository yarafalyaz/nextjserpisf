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
import { formatAccountingExact, formatDate } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableBody,
  DetailTableHead,
  DetailTableRow,
  DetailTableTd,
  DetailTableTh,
} from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"
import {
  AlertTriangle,
  Clock,
  TrendingDown,
  TrendingUp,
  Receipt,
  Building2,
  Calendar,
} from "@/components/ui/fontawesome-icons"

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
      className="rounded-xl border border-amber-500/20 bg-card shadow-2xs overflow-hidden"
    >
      {/* Header & Notice Card */}
      <div className="p-5 border-b border-border bg-amber-50/30 dark:bg-amber-950/10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock className="size-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground uppercase">
                {CHEQUE_OVERDUE_QUEUE_TITLE}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">{queue.noticeText}</p>
            </div>
          </div>
          {queue.terpotong && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
              <AlertTriangle className="size-3" aria-hidden="true" />
              <span>
                {CHEQUE_OVERDUE_TRUNCATED_LABEL}: {queue.rows.length} dari {queue.totalPopulation} lembar
              </span>
            </span>
          )}
        </div>

        {/* Structured Metric Recap Grid */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-border/60">
          {CHEQUE_OVERDUE_DIRECTIONS.map((direction) => {
            const isDiterima = direction === "in"
            return (
              <div
                key={direction}
                className="rounded-lg border border-border bg-surface p-3.5 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground uppercase tracking-tight flex items-center gap-1.5">
                    {isDiterima ? (
                      <TrendingDown className="size-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    ) : (
                      <TrendingUp className="size-3 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    )}
                    {CHEQUE_OVERDUE_DIRECTION_LABELS[direction]}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border/50 text-xs">
                  {CHEQUE_OVERDUE_TIERS.map((tier) => {
                    const item = queue.recap[direction][tier]
                    return (
                      <div key={tier} className="flex flex-col">
                        <span className="text-[11px] text-muted-foreground font-medium truncate">
                          {CHEQUE_OVERDUE_TIER_LABELS[tier]}
                        </span>
                        <span className="font-mono font-bold text-foreground tabular-nums text-xs mt-0.5">
                          {item.count} <span className="text-[10px] font-normal text-muted-foreground">lbr</span>
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground tabular-nums mt-0.5">
                          {formatAccountingExact(item.nominalTercatat)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {queue.unknownDirection.count > 0 && (
          <div className="mt-3 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center justify-between">
            <span>Arah Tidak Dikenal</span>
            <span className="font-mono tabular-nums font-semibold">
              {queue.unknownDirection.count} lembar · {formatAccountingExact(queue.unknownDirection.nominalTercatat)}
            </span>
          </div>
        )}
      </div>

      {isEmpty ? (
        <EmptyState title={CHEQUE_OVERDUE_EMPTY_TEXT} className="py-8" />
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
                  <DetailTableTd>
                    <span className="font-mono text-xs tabular-nums text-foreground font-medium">
                      {formatDate(row.dueDate)}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd className="font-mono text-sm">
                    <Link
                      href="/keuangan/giro"
                      className="font-medium text-primary hover:underline inline-flex items-center gap-1.5"
                    >
                      <Receipt className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                      <span>{row.documentNo}</span>
                    </Link>
                    {row.flags.map((flag) => (
                      <span key={flag} className="block text-[11px] font-medium text-destructive mt-0.5">
                        {flag}
                      </span>
                    ))}
                  </DetailTableTd>
                  <DetailTableTd>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-foreground">
                      {row.typeLabel}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd className="font-mono text-xs text-muted-foreground">
                    {row.number ?? "—"}
                  </DetailTableTd>
                  <DetailTableTd>
                    <div className="flex items-center gap-1.5">
                      <Building2 className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                      <span className="text-xs font-medium text-foreground truncate max-w-[180px]">
                        {row.party ?? "—"}
                      </span>
                    </div>
                  </DetailTableTd>
                  <DetailTableTd>
                    <span className="text-xs font-medium text-foreground">
                      {row.directionLabel}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        row.tierLabel === "Mengendap"
                          ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900"
                          : row.tierLabel === "Lewat Jatuh Tempo"
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900"
                          : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900"
                      }`}
                    >
                      {row.tierLabel}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd align="right">
                    <span className="font-mono text-xs tabular-nums text-foreground font-semibold">
                      {row.umurLewatLabel}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd align="right" className="tabular-nums font-mono text-xs font-semibold text-foreground">
                    {formatAccountingExact(row.amount)}
                  </DetailTableTd>
                </DetailTableRow>
              ))}
              {queue.unknownStatusRows.map((row) => (
                <DetailTableRow key={`unknown-${row.chequeId}`}>
                  <DetailTableTd>
                    <span className="font-mono text-xs tabular-nums text-foreground">
                      {formatDate(row.dueDate)}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd className="font-mono text-sm">
                    <Link href="/keuangan/giro" className="font-medium text-primary hover:underline">
                      {row.documentNo}
                    </Link>
                    <span className="block text-[11px] font-medium text-destructive mt-0.5">
                      {CHEQUE_UNKNOWN_STATUS_LABEL}: {row.status}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd>{row.type}</DetailTableTd>
                  <DetailTableTd className="font-mono text-xs text-muted-foreground">{row.number ?? "—"}</DetailTableTd>
                  <DetailTableTd>{row.party ?? "—"}</DetailTableTd>
                  <DetailTableTd>{row.direction}</DetailTableTd>
                  <DetailTableTd>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
                      {row.statusLabel}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd align="right">
                    <span className="font-mono text-xs tabular-nums font-semibold">
                      {row.umurLewatLabel}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd align="right" className="tabular-nums font-mono text-xs font-semibold">
                    {formatAccountingExact(row.amount)}
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
