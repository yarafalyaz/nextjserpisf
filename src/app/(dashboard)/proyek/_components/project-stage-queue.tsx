import Link from "next/link"
import { Info } from "lucide-react"

import type { ProjectStageQueue } from "@/lib/reports/project-stage-queue"
import {
  PROJECT_STAGE_COLUMN_LABELS,
  PROJECT_STAGE_IN_COMPLETED_PROJECT_LABEL,
  PROJECT_STAGE_LEVELS,
  PROJECT_STAGE_LEVEL_LABELS,
  PROJECT_STAGE_QUEUE_EMPTY_TEXT,
  PROJECT_STAGE_QUEUE_TITLE,
  PROJECT_STAGE_SOURCE_LABELS,
  PROJECT_STAGE_TRUNCATED_LABEL,
} from "@/lib/reports/project-stage-queue"
import { entityHref } from "@/lib/utils/entity-url"
import { formatDate } from "@/lib/utils/format"
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
 * Seksi antrean Tahap Proyek Berjalan Tanpa Progres Baru
 * (F-2026-10-27-092-S, Q-PSQ-3: seksi turunan di halaman proyek
 * existing; daftar existing tidak diubah urutan/batasnya).
 *
 * Render verbatim payload server (AC-PSQ-F1): tingkat, umur, persen,
 * sumber umur, penanda, urutan, dan rekap datang dari builder —
 * komponen ini tidak menghitung ulang apa pun. Baca-saja
 * (BR-PSQ-06/AC-PSQ-F2): tanpa tombol tulis apa pun; tautan baris
 * hanya ke halaman proyek existing. Baris tertanda tampil dengan
 * tandanya (AC-PSQ-F3).
 */
export function ProjectStageQueueSection({
  queue,
}: Readonly<{ queue: ProjectStageQueue }>) {
  const labels = PROJECT_STAGE_COLUMN_LABELS
  const hasRows = queue.rows.length > 0

  return (
    <section
      aria-label={PROJECT_STAGE_QUEUE_TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-col gap-2 p-4 px-5 border-b border-default">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">
              {PROJECT_STAGE_QUEUE_TITLE}
            </h2>
            <div
              className="group relative inline-flex items-center text-muted-foreground hover:text-foreground cursor-help"
              title={queue.noticeText}
            >
              <Info size={15} />
              <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover:block w-72 p-2 bg-popover text-popover-foreground text-xs rounded-lg shadow-md border border-default z-10 pointer-events-none">
                {queue.noticeText}
              </div>
            </div>
          </div>
          {hasRows && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full font-medium bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                Mengendap: {queue.levelCounts.MENGENDAP}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                Berjalan: {queue.levelCounts.BERJALAN}
              </span>
              {queue.levelCounts.TANPA_ACUAN > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  Tanpa Acuan: {queue.levelCounts.TANPA_ACUAN}
                </span>
              )}
            </div>
          )}
        </div>

        {hasRows ? (
          <div className="flex flex-col gap-1 text-xs text-muted-foreground pt-1 border-t border-dashed border-default">
            <p>
              {PROJECT_STAGE_LEVELS.map(
                (level) => `${PROJECT_STAGE_LEVEL_LABELS[level]} ${queue.levelCounts[level]}`,
              ).join(" · ")}
            </p>
            <p>
              {`${PROJECT_STAGE_SOURCE_LABELS.PROGRES_TERAKHIR} ${queue.sourceCounts.PROGRES_TERAKHIR} · ${PROJECT_STAGE_SOURCE_LABELS.MULAI_TANPA_PROGRES} ${queue.sourceCounts.MULAI_TANPA_PROGRES} · ${PROJECT_STAGE_SOURCE_LABELS.TANPA_ACUAN} ${queue.sourceCounts.TANPA_ACUAN}`}
            </p>
            {queue.projectRecap.length > 0 ? (
              <p>
                Proyek:{" "}
                {queue.projectRecap
                  .map((recap) => `${recap.projectName ?? recap.projectId} ${recap.count}`)
                  .join(" · ")}
              </p>
            ) : null}
            {queue.terpotong ? (
              <p className="font-medium text-foreground">
                {PROJECT_STAGE_TRUNCATED_LABEL}: menampilkan {queue.rows.length} dari{" "}
                {queue.totalPopulation} tahap; rekap dari populasi penuh.
              </p>
            ) : null}
          </div>
        ) : (
          /* Saat kosong: tampilkan ringkasan bersih yang tidak membingungkan */
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            <span>Semua tahap proyek berjalan lancar atau belum ada tahap yang aktif.</span>
          </div>
        )}
      </div>

      {!hasRows ? (
        <EmptyState title={PROJECT_STAGE_QUEUE_EMPTY_TEXT} className="py-6" />
      ) : (
        <div className="overflow-x-auto">
          <DetailTable data-report-table={PROJECT_STAGE_QUEUE_TITLE}>
            <DetailTableHead>
              <DetailTableTh>{labels.stage}</DetailTableTh>
              <DetailTableTh>{labels.project}</DetailTableTh>
              <DetailTableTh>{labels.customer}</DetailTableTh>
              <DetailTableTh>{labels.projectStatus}</DetailTableTh>
              <DetailTableTh>{labels.persen}</DetailTableTh>
              <DetailTableTh>{labels.acuan}</DetailTableTh>
              <DetailTableTh>{labels.umur}</DetailTableTh>
              <DetailTableTh>{labels.level}</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {queue.rows.map((row) => (
                <DetailTableRow key={row.stageId}>
                  <DetailTableTd>
                    <Link
                      href={entityHref("/proyek", { id: row.projectId, slug: row.projectSlug })}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.stageName}
                    </Link>
                    {row.flags.map((flag) => (
                      <span key={flag} className="block text-xs font-medium text-destructive">
                        {flag}
                        {flag === PROJECT_STAGE_IN_COMPLETED_PROJECT_LABEL
                          ? `: ${row.projectStatus ?? ""}`
                          : ""}
                      </span>
                    ))}
                  </DetailTableTd>
                  <DetailTableTd>{row.projectName ?? "—"}</DetailTableTd>
                  <DetailTableTd>{row.customerName ?? "—"}</DetailTableTd>
                  <DetailTableTd>{row.projectStatus ?? "—"}</DetailTableTd>
                  <DetailTableTd>{row.persenLabel ?? "—"}</DetailTableTd>
                  <DetailTableTd>
                    {row.acuanTerakhir ? formatDate(row.acuanTerakhir) : "—"}
                    <span className="block text-xs text-muted-foreground">
                      {row.sumberUmurLabel}
                    </span>
                  </DetailTableTd>
                  <DetailTableTd>{row.umurLabel}</DetailTableTd>
                  <DetailTableTd>{row.levelLabel}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </div>
      )}
    </section>
  )
}
