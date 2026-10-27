import Link from "next/link"

import type {
  BankReconciliationDraftLevel,
  BankReconciliationDraftQueue,
  BankReconciliationDraftRow,
} from "@/lib/reports/bank-reconciliation-draft-queue"
import {
  BANK_RECONCILIATION_DRAFT_COLUMN_LABELS,
  BANK_RECONCILIATION_DRAFT_LEVEL_LABELS,
  BANK_RECONCILIATION_DRAFT_NOTICE_TEXT,
  BANK_RECONCILIATION_DRAFT_TITLE,
} from "@/lib/reports/bank-reconciliation-draft-queue"
import { entityHref } from "@/lib/utils/entity-url"
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"

const LEVEL_TONES: Record<BankReconciliationDraftLevel, "danger" | "warning"> = {
  mengendap: "danger",
  menunggu: "warning",
}

function QueueTable({ rows }: Readonly<{ rows: BankReconciliationDraftRow[] }>) {
  return (
    <div className="overflow-x-auto">
      <DetailTable>
        <DetailTableHead>
          <DetailTableTh>{BANK_RECONCILIATION_DRAFT_COLUMN_LABELS.number}</DetailTableTh>
          <DetailTableTh>{BANK_RECONCILIATION_DRAFT_COLUMN_LABELS.account}</DetailTableTh>
          <DetailTableTh>{BANK_RECONCILIATION_DRAFT_COLUMN_LABELS.statementDate}</DetailTableTh>
          <DetailTableTh>{BANK_RECONCILIATION_DRAFT_COLUMN_LABELS.progress}</DetailTableTh>
          <DetailTableTh>{BANK_RECONCILIATION_DRAFT_COLUMN_LABELS.age}</DetailTableTh>
          <DetailTableTh align="right">Saldo Koran</DetailTableTh>
          <DetailTableTh align="right">Saldo Buku</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          {rows.map((row) => (
            <DetailTableRow key={row.reconciliationId}>
              <DetailTableTd>
                <Link
                  href={entityHref("/keuangan/rekonsiliasi-bank", {
                    id: row.reconciliationId,
                    slug: row.slug,
                  })}
                  className="inline-flex min-h-11 items-center font-medium text-primary hover:underline sm:min-h-9"
                >
                  {row.reconciliationNumber ?? `REC-${row.reconciliationId}`}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {row.accountCode ?? "Tanpa kode"} · {row.accountName ?? "Tanpa akun"}
                </span>
              </DetailTableTd>
              <DetailTableTd>
                {row.accountName ?? "Tanpa akun"}
                {row.accountCode ? (
                  <span className="block text-xs text-muted-foreground">{row.accountCode}</span>
                ) : null}
              </DetailTableTd>
              <DetailTableTd>{formatDate(row.statementDate)}</DetailTableTd>
              <DetailTableTd>
                {formatNumber(row.matchedItemCount)} dari {formatNumber(row.matchingItemCount)}{" "}
                tercocok
                {row.adjustmentItemCount > 0 ? (
                  <span className="block text-xs text-muted-foreground">
                    {formatNumber(row.adjustmentItemCount)} penyesuaian
                  </span>
                ) : null}
              </DetailTableTd>
              <DetailTableTd>
                <StatusChip
                  status={row.tingkat}
                  customLabel={row.tingkatLabel}
                  customTone={LEVEL_TONES[row.tingkat]}
                />
                <span className="block text-xs text-muted-foreground">
                  {row.umurDraftHari === 0 ? "hari ini" : `${formatNumber(row.umurDraftHari)} hari`}
                </span>
              </DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(row.statementBalance)}</DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(row.bookBalance)}</DetailTableTd>
            </DetailTableRow>
          ))}
        </DetailTableBody>
      </DetailTable>
    </div>
  )
}

/**
 * Seksi antrean rekonsiliasi bank draft mengendap
 * (F-2026-10-27-097-S, penempatan Q-RBK-7: seksi turunan halaman daftar).
 *
 * Seluruh kata, tingkat, umur, hitungan kemajuan, dan saldo verbatim
 * payload `buildBankReconciliationDraftQueue` — UI tidak menghitung
 * ulang (AC-RBK-F1). Kemajuan tampil hitungan mentah "x dari y
 * tercocok" tanpa persen/siap-selesai (Q-RBK-3, BR-RBK-04); saldo
 * verbatim header tanpa selisih/status seimbang (BR-RBK-05).
 * Baca-saja: nol tombol Cocokkan/Penyesuaian/Selesaikan/Hapus;
 * satu-satunya jalan aksi = tautan detail existing (AC-RBK-F2).
 */
export function BankReconciliationDraftQueueCard({
  queue,
}: Readonly<{ queue: BankReconciliationDraftQueue }>) {
  const stale = queue.rows.filter((row) => row.tingkat === "mengendap")
  const waiting = queue.rows.filter((row) => row.tingkat !== "mengendap")
  return (
    <section
      aria-label={BANK_RECONCILIATION_DRAFT_TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          {BANK_RECONCILIATION_DRAFT_TITLE}
        </h2>
        <p className="text-xs text-muted-foreground">
          {formatNumber(queue.totalDocuments)} dokumen · {BANK_RECONCILIATION_DRAFT_LEVEL_LABELS.mengendap}{" "}
          {formatNumber(queue.levelCounts.mengendap)} · {BANK_RECONCILIATION_DRAFT_LEVEL_LABELS.menunggu}{" "}
          {formatNumber(queue.levelCounts.menunggu)}
        </p>
      </div>
      <div className="p-4 px-5">
        <p className="text-xs text-muted-foreground">{BANK_RECONCILIATION_DRAFT_NOTICE_TEXT}</p>
        {queue.rows.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            Belum ada rekonsiliasi bank yang masih draft
          </p>
        ) : (
          <>
            {stale.length > 0 ? (
              <section
                aria-label={BANK_RECONCILIATION_DRAFT_LEVEL_LABELS.mengendap}
                className="mt-6 first:mt-4"
              >
                <h3 className="text-sm font-semibold text-foreground">
                  {BANK_RECONCILIATION_DRAFT_LEVEL_LABELS.mengendap} ({formatNumber(stale.length)})
                </h3>
                <QueueTable rows={stale} />
              </section>
            ) : null}
            {waiting.length > 0 ? (
              <section
                aria-label={BANK_RECONCILIATION_DRAFT_LEVEL_LABELS.menunggu}
                className="mt-6 first:mt-4"
              >
                <h3 className="text-sm font-semibold text-foreground">
                  {BANK_RECONCILIATION_DRAFT_LEVEL_LABELS.menunggu} (
                  {formatNumber(waiting.length)})
                </h3>
                <QueueTable rows={waiting} />
              </section>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
