import Link from "next/link"

import type {
  RecurringDueLevel,
  RecurringDueQueue,
  RecurringDueRow,
} from "@/lib/reports/recurring-due-queue"
import { RECURRING_DUE_BUCKET_LABELS } from "@/lib/reports/recurring-due-queue"
import { entityHref } from "@/lib/utils/entity-url"
import { formatDate, formatNumber } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"

const LEVEL_TONES: Record<RecurringDueLevel, "danger" | "warning"> = {
  mengendap: "danger",
  menunggu: "warning",
}

function QueueTable({ rows }: Readonly<{ rows: RecurringDueRow[] }>) {
  return (
    <div className="overflow-x-auto">
      <DetailTable>
        <DetailTableHead>
          <DetailTableTh>Jadwal</DetailTableTh>
          <DetailTableTh>Ember</DetailTableTh>
          <DetailTableTh>Tingkat</DetailTableTh>
          <DetailTableTh>Frekuensi</DetailTableTh>
          <DetailTableTh>Seharusnya Jalan Sejak</DetailTableTh>
          <DetailTableTh align="right">Umur</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          {rows.map((row) => (
            <DetailTableRow key={row.scheduleId}>
              <DetailTableTd>
                <Link
                  href={entityHref("/pengaturan/transaksi-berulang", {
                    id: row.scheduleId,
                    slug: row.slug,
                  })}
                  className="inline-flex min-h-11 items-center font-medium text-primary hover:underline sm:min-h-9"
                >
                  {row.name}
                </Link>
                {row.neverRan && row.neverRanLabel ? (
                  <span className="block text-xs text-muted-foreground">{row.neverRanLabel}</span>
                ) : null}
              </DetailTableTd>
              <DetailTableTd>
                <StatusChip status={row.bucket} customLabel={row.bucketLabel} customTone="warning" />
                {row.failureMessage ? (
                  <span className="block text-xs text-muted-foreground">{row.failureMessage}</span>
                ) : null}
              </DetailTableTd>
              <DetailTableTd>
                <StatusChip
                  status={row.level}
                  customLabel={row.levelLabel}
                  customTone={LEVEL_TONES[row.level]}
                />
              </DetailTableTd>
              <DetailTableTd>{row.frequencyLabel}</DetailTableTd>
              <DetailTableTd>{formatDate(row.nextRunDate)}</DetailTableTd>
              <DetailTableTd align="right">
                {row.ageDays === 0 ? "hari ini" : `${formatNumber(row.ageDays)} hari`}
              </DetailTableTd>
            </DetailTableRow>
          ))}
        </DetailTableBody>
      </DetailTable>
    </div>
  )
}

/**
 * Seksi antrean transaksi berulang jatuh tempo / gagal jalan mengendap
 * (F-2026-10-27-103-S, penempatan Q-RCQ103-3: seksi turunan halaman master).
 *
 * Seluruh kata, ember, tingkat, umur, frekuensi, jenis, pesan gagal, dan
 * rekap verbatim payload `buildRecurringDueQueue` — UI tidak menghitung
 * ulang (AC-RCQ103-F1). Label umur "seharusnya jalan sejak …", bukan
 * "gagal selama N hari" (AC-RCQ103-F1). Baca-saja: nol tombol
 * Jalankan/Perbaiki/Hapus; satu-satunya jalan aksi = tautan master/form
 * ubah existing (AC-RCQ103-F2, BR-RCQ103-06).
 */
export function RecurringDueQueueCard({ queue }: Readonly<{ queue: RecurringDueQueue }>) {
  const failed = queue.rows.filter((row) => row.bucket === "GAGAL_JALAN")
  const pending = queue.rows.filter((row) => row.bucket !== "GAGAL_JALAN")
  return (
    <section
      aria-label={queue.title}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">{queue.title}</h2>
        <p className="text-xs text-muted-foreground">
          {formatNumber(queue.totalSchedules)} jadwal · Gagal Jalan{" "}
          {formatNumber(queue.bucketCounts.GAGAL_JALAN)} · Jatuh Tempo Belum Jalan{" "}
          {formatNumber(queue.bucketCounts.JATUH_TEMPO_BELUM_JALAN)} · Mengendap{" "}
          {formatNumber(queue.levelCounts.mengendap)}
        </p>
      </div>
      <div className="p-4 px-5">
        <p className="text-xs text-muted-foreground">{queue.noticeText}</p>
        {queue.rows.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            Belum ada jadwal transaksi berulang yang jatuh tempo
          </p>
        ) : (
          <>
            {failed.length > 0 ? (
              <section aria-label={RECURRING_DUE_BUCKET_LABELS.GAGAL_JALAN} className="mt-6 first:mt-4">
                <h3 className="text-sm font-semibold text-foreground">
                  {RECURRING_DUE_BUCKET_LABELS.GAGAL_JALAN} ({formatNumber(failed.length)})
                </h3>
                <QueueTable rows={failed} />
              </section>
            ) : null}
            {pending.length > 0 ? (
              <section
                aria-label={RECURRING_DUE_BUCKET_LABELS.JATUH_TEMPO_BELUM_JALAN}
                className="mt-6 first:mt-4"
              >
                <h3 className="text-sm font-semibold text-foreground">
                  {RECURRING_DUE_BUCKET_LABELS.JATUH_TEMPO_BELUM_JALAN} (
                  {formatNumber(pending.length)})
                </h3>
                <QueueTable rows={pending} />
              </section>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
