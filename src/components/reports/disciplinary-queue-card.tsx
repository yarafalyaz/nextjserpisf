import Link from "next/link"

import type {
  DisciplinaryQueue,
  DisciplinaryQueueRow,
  DisciplinaryQueueStage,
} from "@/lib/reports/disciplinary-queue"
import {
  DISCIPLINARY_QUEUE_COLUMN_LABELS,
  DISCIPLINARY_QUEUE_EMPTY_TEXT,
  DISCIPLINARY_QUEUE_NOTICE_TEXT,
  DISCIPLINARY_QUEUE_STAGE_EMPTY_TEXT,
  DISCIPLINARY_QUEUE_STAGE_LABELS,
  DISCIPLINARY_QUEUE_TITLE,
} from "@/lib/reports/disciplinary-queue"
import { formatDate, formatNumber } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { ReportCardShell } from "./report-card-shell"

const STAGES: readonly DisciplinaryQueueStage[] = [
  "draft",
  "pending_approval",
]

/**
 * 095-F (F-2026-10-27-095-S, AC-DQ-F1..F3): seksi antrean rekod disiplin
 * belum terbit di halaman `/sdm/disiplin`. Murni presentasi atas payload
 * `DisciplinaryQueue` dari loader server: label tahap/level/kategori/
 * umur ditempel verbatim — UI TIDAK menghitung umur/tahap/tingkat
 * sendiri. Dua ember tahap tampil terpisah berlabel verbatim Q-DQ-2.
 * Tanpa isi kasus (BR-DQ-04), tanpa tombol aksi apa pun (BR-DQ-10);
 * tautan baris hanya ke detail existing `/sdm/disiplin/[id]`.
 */
export function DisciplinaryQueueCard({
  queue,
}: Readonly<{ queue: DisciplinaryQueue }>) {
  const { summary } = queue
  const byStage: Record<DisciplinaryQueueStage, DisciplinaryQueueRow[]> = {
    draft: queue.draft,
    pending_approval: queue.pendingApproval,
  }

  return (
    <ReportCardShell
      label={DISCIPLINARY_QUEUE_TITLE}
      title={DISCIPLINARY_QUEUE_TITLE}
      summary={`${formatNumber(summary.draft)} ${DISCIPLINARY_QUEUE_STAGE_LABELS.draft} · ${formatNumber(summary.pending_approval)} ${DISCIPLINARY_QUEUE_STAGE_LABELS.pending_approval} · ${formatNumber(summary.mengendap)} Mengendap · ${formatNumber(summary.total)} belum terbit`}
      isEmpty={queue.rows.length === 0}
      emptyText={DISCIPLINARY_QUEUE_EMPTY_TEXT}
      notice={DISCIPLINARY_QUEUE_NOTICE_TEXT}
    >
      <div className="flex flex-col gap-6">
        {STAGES.map((stage) => (
          <section key={stage} aria-label={DISCIPLINARY_QUEUE_STAGE_LABELS[stage]}>
            <h3 className="text-sm font-semibold text-foreground">
              {DISCIPLINARY_QUEUE_STAGE_LABELS[stage]}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                ({formatNumber(byStage[stage].length)})
              </span>
            </h3>
            {byStage[stage].length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {DISCIPLINARY_QUEUE_STAGE_EMPTY_TEXT[stage]}
              </p>
            ) : (
              <div className="mt-2">
                <DetailTable aria-label={DISCIPLINARY_QUEUE_STAGE_LABELS[stage]}>
                  <DetailTableHead>
                    <DetailTableTh>{DISCIPLINARY_QUEUE_COLUMN_LABELS.karyawan}</DetailTableTh>
                    <DetailTableTh>{DISCIPLINARY_QUEUE_COLUMN_LABELS.departemen}</DetailTableTh>
                    <DetailTableTh>{DISCIPLINARY_QUEUE_COLUMN_LABELS.jenjang}</DetailTableTh>
                    <DetailTableTh>{DISCIPLINARY_QUEUE_COLUMN_LABELS.kategori}</DetailTableTh>
                    <DetailTableTh>{DISCIPLINARY_QUEUE_COLUMN_LABELS.tanggalKejadian}</DetailTableTh>
                    <DetailTableTh>{DISCIPLINARY_QUEUE_COLUMN_LABELS.tahap}</DetailTableTh>
                    <DetailTableTh>{DISCIPLINARY_QUEUE_COLUMN_LABELS.menunggu}</DetailTableTh>
                    <DetailTableTh>{DISCIPLINARY_QUEUE_COLUMN_LABELS.tingkat}</DetailTableTh>
                    <DetailTableTh>{DISCIPLINARY_QUEUE_COLUMN_LABELS.pengaju}</DetailTableTh>
                    <DetailTableTh>{DISCIPLINARY_QUEUE_COLUMN_LABELS.persetujuan}</DetailTableTh>
                    <DetailTableTh>{DISCIPLINARY_QUEUE_COLUMN_LABELS.dokumen}</DetailTableTh>
                    <DetailTableTh>{DISCIPLINARY_QUEUE_COLUMN_LABELS.rincian}</DetailTableTh>
                  </DetailTableHead>
                  <DetailTableBody>
                    {byStage[stage].map((row) => (
                      <DetailTableRow key={row.id}>
                        <DetailTableTd>{row.employeeName}</DetailTableTd>
                        <DetailTableTd>{row.departmentName ?? "—"}</DetailTableTd>
                        <DetailTableTd>{row.levelLabel ?? row.level}</DetailTableTd>
                        <DetailTableTd>{row.violationCategory}</DetailTableTd>
                        <DetailTableTd>{formatDate(row.violationDate)}</DetailTableTd>
                        <DetailTableTd>{row.stageLabel}</DetailTableTd>
                        <DetailTableTd>{formatNumber(row.umurMenungguHari)} hari</DetailTableTd>
                        <DetailTableTd>{row.tierLabel}</DetailTableTd>
                        <DetailTableTd>{row.requesterName ?? row.requestedBy}</DetailTableTd>
                        <DetailTableTd>
                          Pertama: {row.approvedBy ?? "—"} · Kedua:{" "}
                          {row.secondApprovedBy ?? "—"}
                        </DetailTableTd>
                        <DetailTableTd>{row.documentNo ?? "—"}</DetailTableTd>
                        <DetailTableTd>
                          <Link
                            href={`/sdm/disiplin/${row.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            Lihat
                          </Link>
                        </DetailTableTd>
                      </DetailTableRow>
                    ))}
                  </DetailTableBody>
                </DetailTable>
              </div>
            )}
          </section>
        ))}
      </div>
    </ReportCardShell>
  )
}
