import Link from "next/link"

import type {
  ReimbursementQueue,
  ReimbursementQueueLevel,
  ReimbursementQueueRow,
} from "@/lib/reports/reimbursement-queue"
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

const LEVEL_TONES: Record<ReimbursementQueueLevel, "danger" | "warning"> = {
  mengendap: "danger",
  menunggu: "warning",
}

function QueueTable({ rows }: Readonly<{ rows: ReimbursementQueueRow[] }>) {
  return (
    <div className="overflow-x-auto">
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
            <DetailTableRow key={row.claimId}>
              <DetailTableTd>
                <Link
                  href={entityHref("/keuangan/pengeluaran", {
                    id: row.claimId,
                    slug: row.slug,
                  })}
                  className="inline-flex min-h-11 items-center font-medium text-primary hover:underline sm:min-h-9"
                >
                  {row.documentNo}
                </Link>
              </DetailTableTd>
              <DetailTableTd>
                {row.employeeName ?? (
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
                  formatDate(row.accrualJournalDate)
                ) : (
                  <span className="text-muted-foreground">{row.noAccrualLabel}</span>
                )}
              </DetailTableTd>
              <DetailTableTd align="right">
                {row.waitingDays === null ? "—" : `${row.waitingDays} hari`}
              </DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(row.amount)}</DetailTableTd>
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
  return (
    <section
      aria-label={queue.title}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">{queue.title}</h2>
        <p className="text-xs text-muted-foreground">
          {queue.totalClaims} klaim · Mengendap {queue.levelCounts.mengendap} · Menunggu{" "}
          {queue.levelCounts.menunggu} · {formatCurrency(queue.totalStoredAmount)} (
          {queue.totalLabel})
        </p>
      </div>
      <div className="p-4 px-5">
        <p className="text-xs text-muted-foreground">{queue.noticeText}</p>
        {queue.rows.length === 0 && queue.paidWithoutJournalRows.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            Belum ada klaim reimbursement disetujui yang menunggu pembayaran
          </p>
        ) : (
          <>
            {queue.rows.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                Belum ada klaim reimbursement disetujui yang menunggu pembayaran
              </p>
            ) : (
              <QueueTable rows={queue.rows} />
            )}
            {queue.paidWithoutJournalRows.length > 0 ? (
              <section aria-label={queue.paidWithoutJournalLabel} className="mt-6">
                <h3 className="text-sm font-semibold text-foreground">
                  {queue.paidWithoutJournalLabel} ({queue.paidWithoutJournalRows.length})
                </h3>
                <QueueTable rows={queue.paidWithoutJournalRows} />
              </section>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
