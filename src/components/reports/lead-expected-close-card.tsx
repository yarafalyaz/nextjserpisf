import type { ReactNode } from "react"
import Link from "next/link"
import type {
  LeadExpectedCloseBucket,
  LeadExpectedCloseQueue,
  LeadExpectedCloseRow,
} from "@/lib/reports/lead-expected-close"
import { entityHref } from "@/lib/utils/entity-url"
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"

/**
 * F-2026-10-25-027-S: kartu antrean prospek mendekati/lampaui target tutup
 * di halaman corong existing (Q-EC-4 Lead — bukan route baru).
 *
 * Komponen murni presentasi atas `LeadExpectedCloseQueue` dari builder
 * Backend (`lead-expected-close.ts`): UI menempel label tahap/ember,
 * sisa/overdue hari, Σ per ember, dan notice nilai apa adanya — nol hitung
 * ulang tanggal/Σ di UI (AC-EC-F1). Antrean baca-saja: aksi per baris
 * hanya tautan detail lead existing; tanpa `view_leads` tautan nonaktif
 * tertanda dan baris tetap tampil (Q-EC-2/BR-EC-08, AC-EC-F2).
 * `estimatedValue` kosong tampil label tanpa nilai, bukan Rp0 (BR-EC-09).
 * Nol tombol ubah status/tanggal/notifikasi (BR-EC-07, AC-EC-F3).
 */
export function LeadExpectedCloseCard({
  queue,
  canViewLeads,
}: Readonly<{ queue: LeadExpectedCloseQueue; canViewLeads: boolean }>) {
  return (
    <section
      aria-label="Antrean target tutup prospek"
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          Antrean target tutup prospek
        </h2>
        <p className="text-xs text-muted-foreground">
          {formatNumber(queue.totalInQueue)} prospek dalam jendela{" "}
          {formatNumber(queue.windowDays)} hari · {formatNumber(queue.totalWithoutTarget)}{" "}
          tanpa target tutup
        </p>
      </div>
      <div className="p-4 px-5 flex flex-col gap-5">
        <p className="text-xs text-muted-foreground">{queue.valueNotice}</p>
        {queue.buckets.map((bucket) => (
          <BucketSection key={bucket.bucket} bucket={bucket} canViewLeads={canViewLeads} />
        ))}
      </div>
    </section>
  )
}

function BucketSection({
  bucket,
  canViewLeads,
}: Readonly<{ bucket: LeadExpectedCloseBucket; canViewLeads: boolean }>) {
  return (
    <section aria-label={bucket.label} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{bucket.label}</h3>
        <p className="text-xs text-muted-foreground">
          {formatNumber(bucket.count)} prospek ·{" "}
          {formatCurrency(bucket.totalEstimatedValue, { decimals: 2 })}
          {bucket.noValueCount > 0
            ? ` · ${formatNumber(bucket.noValueCount)} tanpa nilai estimasi`
            : null}
        </p>
      </div>
      {bucket.rows.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">Belum ada prospek pada ember ini</p>
      ) : (
        <DetailTable>
          <DetailTableHead>
            <DetailTableTh>No. Prospek</DetailTableTh>
            <DetailTableTh>Nama</DetailTableTh>
            <DetailTableTh>Tahap</DetailTableTh>
            <DetailTableTh>Target Tutup</DetailTableTh>
            <DetailTableTh align="right">Sisa / Lewat</DetailTableTh>
            <DetailTableTh>Penanggung</DetailTableTh>
            <DetailTableTh align="right">Nilai Estimasi</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {bucket.rows.map((row) => (
              <QueueRow key={row.leadId} row={row} canViewLeads={canViewLeads} />
            ))}
          </DetailTableBody>
        </DetailTable>
      )}
    </section>
  )
}

function QueueRow({
  row,
  canViewLeads,
}: Readonly<{ row: LeadExpectedCloseRow; canViewLeads: boolean }>) {
  const numberLabel = row.leadNumber ?? row.name
  return (
    <DetailTableRow>
      <DetailTableTd>
        {canViewLeads ? (
          <Link
            href={entityHref("/crm/leads", { id: row.leadId, slug: row.slug })}
            className="font-medium text-primary hover:underline"
          >
            {numberLabel}
          </Link>
        ) : (
          <span>
            <span className="font-medium">{numberLabel}</span>{" "}
            <span className="text-xs text-muted-foreground">
              (detail butuh izin lihat prospek)
            </span>
          </span>
        )}
      </DetailTableTd>
      <DetailTableTd>{row.name}</DetailTableTd>
      <DetailTableTd>{row.stageLabel}</DetailTableTd>
      <DetailTableTd>
        {row.expectedCloseDate ? formatDate(row.expectedCloseDate) : "—"}
      </DetailTableTd>
      <DetailTableTd align="right">{urgencyLabel(row)}</DetailTableTd>
      <DetailTableTd>{row.assigneeLabel}</DetailTableTd>
      <DetailTableTd align="right">
        {row.hasEstimatedValue ? (
          formatCurrency(row.estimatedValue, { decimals: 2 })
        ) : (
          <span className="text-muted-foreground">{row.noValueLabel}</span>
        )}
      </DetailTableTd>
    </DetailTableRow>
  )
}

/** Teks urgensi verbatim dari angka builder — tanpa hitung tanggal di UI. */
function urgencyLabel(row: LeadExpectedCloseRow): ReactNode {
  if (row.overdueDays !== null) {
    return (
      <span className="font-medium text-destructive">
        Lewat {formatNumber(row.overdueDays)} hari
      </span>
    )
  }
  if (row.remainingDays !== null) {
    return row.remainingDays === 0 ? (
      <span className="font-medium">Hari ini</span>
    ) : (
      <span>{formatNumber(row.remainingDays)} hari lagi</span>
    )
  }
  return <span className="text-muted-foreground">—</span>
}
