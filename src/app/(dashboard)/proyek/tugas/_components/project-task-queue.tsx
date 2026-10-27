import Link from "next/link"

import type { ProjectTaskQueue } from "@/lib/reports/project-task-queue"
import {
  PROJECT_TASK_BUCKETS,
  PROJECT_TASK_BUCKET_LABELS,
  PROJECT_TASK_COLUMN_LABELS,
  PROJECT_TASK_QUEUE_EMPTY_TEXT,
  PROJECT_TASK_QUEUE_TITLE,
  PROJECT_TASK_STATUS_LABELS,
  PROJECT_TASK_TRUNCATED_LABEL,
  PROJECT_TASK_UNASSIGNED_LABEL,
  PROJECT_TASK_UNKNOWN_STATUS_LABEL,
} from "@/lib/reports/project-task-queue"
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
 * Seksi antrean Tugas Proyek Lewat Tenggat (F-2026-10-27-091-S,
 * Q-PTQ-4: seksi turunan di halaman tugas existing; daftar existing
 * tidak diubah urutan/batasnya).
 *
 * Render verbatim payload server (AC-PTQ-F1): ember, umur/sisa,
 * urutan, dan rekap datang dari builder — komponen ini tidak
 * menghitung ulang apa pun. Baca-saja (BR-PTQ-07/AC-PTQ-F2): tanpa
 * tombol tulis apa pun; tautan baris hanya ke detail tugas existing.
 * Baris tertanda tampil dengan tandanya (AC-PTQ-F3).
 */
export function ProjectTaskQueueSection({
  queue,
}: Readonly<{ queue: ProjectTaskQueue }>) {
  const labels = PROJECT_TASK_COLUMN_LABELS

  return (
    <section
      aria-label={PROJECT_TASK_QUEUE_TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-col gap-1 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          {PROJECT_TASK_QUEUE_TITLE}
        </h2>
        <p className="text-xs text-muted-foreground">{queue.noticeText}</p>
        <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
          <p>
            {PROJECT_TASK_BUCKETS.map(
              (bucket) => `${PROJECT_TASK_BUCKET_LABELS[bucket]} ${queue.bucketCounts[bucket]}`,
            ).join(" · ")}
          </p>
          <p>
            {`${PROJECT_TASK_STATUS_LABELS.pending} ${queue.statusCounts.pending} · ${PROJECT_TASK_STATUS_LABELS.in_progress} ${queue.statusCounts.in_progress}`}
            {queue.unknownStatusCount > 0
              ? ` · ${PROJECT_TASK_UNKNOWN_STATUS_LABEL} ${queue.unknownStatusCount}`
              : ""}
          </p>
          {queue.projectRecap.length > 0 ? (
            <p>
              Proyek:{" "}
              {queue.projectRecap
                .map((recap) => `${recap.projectName ?? recap.projectId} ${recap.count}`)
                .join(" · ")}
            </p>
          ) : null}
          {queue.assigneeRecap.length > 0 ? (
            <p>
              Penanggung Jawab:{" "}
              {queue.assigneeRecap
                .map((recap) => `${recap.assigneeLabel} ${recap.count}`)
                .join(" · ")}
            </p>
          ) : null}
          {queue.terpotong ? (
            <p className="font-medium text-foreground">
              {PROJECT_TASK_TRUNCATED_LABEL}: menampilkan {queue.rows.length} dari{" "}
              {queue.totalPopulation} tugas; rekap dari populasi penuh.
            </p>
          ) : null}
        </div>
      </div>

      {queue.rows.length === 0 ? (
        <EmptyState title={PROJECT_TASK_QUEUE_EMPTY_TEXT} className="py-6" />
      ) : (
        <div className="overflow-x-auto">
          <DetailTable data-report-table={PROJECT_TASK_QUEUE_TITLE}>
            <DetailTableHead>
              <DetailTableTh>{labels.name}</DetailTableTh>
              <DetailTableTh>{labels.project}</DetailTableTh>
              <DetailTableTh>{labels.assignee}</DetailTableTh>
              <DetailTableTh>{labels.status}</DetailTableTh>
              <DetailTableTh>{labels.dueDate}</DetailTableTh>
              <DetailTableTh>{labels.bucket}</DetailTableTh>
              <DetailTableTh>{labels.keterlambatan}</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {queue.rows.map((row) => (
                <DetailTableRow key={row.taskId}>
                  <DetailTableTd>
                    <Link
                      href={entityHref("/proyek/tugas", { id: row.taskId, slug: row.slug })}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.name}
                    </Link>
                    {row.flags.map((flag) => (
                      <span key={flag} className="block text-xs font-medium text-destructive">
                        {flag}
                        {flag === PROJECT_TASK_UNKNOWN_STATUS_LABEL ? `: ${row.status}` : ""}
                      </span>
                    ))}
                  </DetailTableTd>
                  <DetailTableTd>{row.projectName ?? "—"}</DetailTableTd>
                  <DetailTableTd>
                    {row.belumDitugaskan ? PROJECT_TASK_UNASSIGNED_LABEL : row.assigneeLabel}
                  </DetailTableTd>
                  <DetailTableTd>{row.statusLabel}</DetailTableTd>
                  <DetailTableTd>
                    {row.dueDate ? formatDate(row.dueDate) : row.bucketLabel}
                  </DetailTableTd>
                  <DetailTableTd>{row.bucketLabel}</DetailTableTd>
                  <DetailTableTd>{row.keterlambatanLabel}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </div>
      )}
    </section>
  )
}
