import Link from "next/link"
import type { PerformanceQueue } from "@/lib/reports/performance-review-queue"
import {
  PERFORMANCE_QUEUE_COLUMN_LABELS,
  PERFORMANCE_QUEUE_EMPTY_TEXT,
  PERFORMANCE_QUEUE_NO_SCORE_LABEL,
  PERFORMANCE_QUEUE_NOTICE_TEXT,
  PERFORMANCE_QUEUE_TITLE,
} from "@/lib/reports/performance-review-queue"
import { formatDate, formatNumber } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"

/**
 * 077-F (F-2026-10-27-077-S, AC-PFQ-F1..F3): seksi antrean penilaian kinerja
 * belum selesai. Komponen murni presentasi atas `PerformanceQueue` dari
 * loader server (`getPerformanceQueue`): ember, tingkat, umur, label, rekap
 * ditempel apa adanya — UI TIDAK menghitung/mengurut ulang, TIDAK memberi
 * peringkat, TIDAK menampilkan nama penilai atau data gaji (Q-PFQ-6/8).
 * Tautan baris hanya ke detail siklus existing; nol tombol Nilai/Finalisasi
 * dari antrean tahap 1 — penilaian tetap dari detail siklus (notice server).
 */
export function PerformanceQueueCard({
  queue,
}: Readonly<{ queue: PerformanceQueue }>) {
  const { rows, summary } = queue

  return (
    <section
      aria-label={PERFORMANCE_QUEUE_TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          {PERFORMANCE_QUEUE_TITLE}
        </h2>
        <p className="text-xs text-muted-foreground">
          {formatNumber(summary.mengendap)} mengendap ·{" "}
          {formatNumber(summary.menunggu)} menunggu ·{" "}
          {formatNumber(summary.totalBelumSelesai)} belum selesai
        </p>
      </div>
      <div className="p-4 px-5 flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">{PERFORMANCE_QUEUE_NOTICE_TEXT}</p>
        {rows.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            {PERFORMANCE_QUEUE_EMPTY_TEXT}
          </p>
        ) : (
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>{PERFORMANCE_QUEUE_COLUMN_LABELS.karyawan}</DetailTableTh>
              <DetailTableTh>{PERFORMANCE_QUEUE_COLUMN_LABELS.siklus}</DetailTableTh>
              <DetailTableTh>{PERFORMANCE_QUEUE_COLUMN_LABELS.tahap}</DetailTableTh>
              <DetailTableTh>{PERFORMANCE_QUEUE_COLUMN_LABELS.skorDiri}</DetailTableTh>
              <DetailTableTh>{PERFORMANCE_QUEUE_COLUMN_LABELS.skorAtasan}</DetailTableTh>
              <DetailTableTh>{PERFORMANCE_QUEUE_COLUMN_LABELS.periodeBerakhir}</DetailTableTh>
              <DetailTableTh>{PERFORMANCE_QUEUE_COLUMN_LABELS.menunggu}</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {rows.map((row) => (
                <DetailTableRow key={`${row.cycleId}-${row.employeeId}`}>
                  <DetailTableTd>{row.employeeName}</DetailTableTd>
                  <DetailTableTd>
                    <Link
                      href={`/sdm/kinerja/${row.cycleSlug ?? row.cycleId}`}
                      className="text-primary hover:underline"
                    >
                      {row.cycleName}
                    </Link>
                  </DetailTableTd>
                  <DetailTableTd>
                    <span className="inline-flex items-center rounded-full border border-default px-2 py-0.5 text-xs font-medium text-foreground">
                      {row.levelLabel}
                    </span>
                    <span className="block text-xs text-muted-foreground">{row.stageLabel}</span>
                    {row.tanpaSasaran ? (
                      <span className="block text-xs text-muted-foreground">tanpaSasaran</span>
                    ) : null}
                  </DetailTableTd>
                  <DetailTableTd>{row.selfScore ?? PERFORMANCE_QUEUE_NO_SCORE_LABEL}</DetailTableTd>
                  <DetailTableTd>{row.managerScore ?? PERFORMANCE_QUEUE_NO_SCORE_LABEL}</DetailTableTd>
                  <DetailTableTd>{formatDate(row.periodEnd)}</DetailTableTd>
                  <DetailTableTd>{formatNumber(row.umurMenungguHari)} hari</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        )}
      </div>
    </section>
  )
}
