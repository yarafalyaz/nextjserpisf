import Link from "next/link"

import type { ProjectTaskQueue } from "@/lib/reports/project-task-queue"
import {
  PROJECT_TASK_BUCKETS,
  PROJECT_TASK_BUCKET_LABELS,
  PROJECT_TASK_COLUMN_LABELS,
  PROJECT_TASK_COLUMN_LABELS_TSQ,
  PROJECT_TASK_MENGENDAP_LABEL,
  PROJECT_TASK_OPEN_QUEUE_TITLE,
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
 * Permukaan gabungan Tugas Proyek Terbuka (F-2026-10-27-102-S, Q-TSQ-3):
 * satu kartu antrean, dua seksi — Tenggat (judul 091-S TETAP) di atas,
 * Mengendap di bawah. Urutan baris antar seksi mengikuti urutan server
 * BR-TSQ-10 apa adanya (belum-ditugaskan+mengendap dulu).
 *
 * Render verbatim payload server (AC-TSQ-F1): ember, umur/sisa, label
 * dua umur, dan rekap datang dari builder — komponen ini tidak
 * menghitung ulang apa pun. Baca-saja (BR-TSQ-06/AC-TSQ-F2): tanpa
 * tombol tulis apa pun; tautan baris hanya ke detail tugas existing.
 * Baris tertanda tampil dengan tandanya (AC-TSQ-F3).
 */
export function ProjectTaskQueueSection({
  queue,
}: Readonly<{ queue: ProjectTaskQueue }>) {
  const labels = PROJECT_TASK_COLUMN_LABELS
  // Seksi Tenggat = populasi penuh tampil server (urutan BR-TSQ-10):
  // 091-S tidak mendefinisikan saringan fokus, seksi ini judulnya TETAP.
  const tenggatRows = queue.rows
  // Seksi Mengendap = sub-populasi tingkat MENGENDAP server apa adanya.
  const mengendapRows = queue.rows.filter((row) => row.mengendap)

  return (
    <section
      aria-label={PROJECT_TASK_OPEN_QUEUE_TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-col gap-1 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          {PROJECT_TASK_OPEN_QUEUE_TITLE}
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
          <p>
            {`${PROJECT_TASK_MENGENDAP_LABEL} ${queue.mengendapCount} · ${PROJECT_TASK_UNASSIGNED_LABEL} ${queue.belumDitugaskanCount}`}
            {` · ${PROJECT_TASK_MENGENDAP_LABEL} + ${PROJECT_TASK_UNASSIGNED_LABEL} ${queue.mengendapBelumDitugaskanCount}`}
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
        <>
          <section aria-label={PROJECT_TASK_QUEUE_TITLE}>
            <h3 className="px-5 pt-3 text-xs font-semibold text-foreground">
              {PROJECT_TASK_QUEUE_TITLE}
            </h3>
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
                  <DetailTableTh>{PROJECT_TASK_COLUMN_LABELS_TSQ.mengendap}</DetailTableTh>
                  <DetailTableTh>Penugasan</DetailTableTh>
                </DetailTableHead>
                <DetailTableBody>
                  {tenggatRows.map((row) => (
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
                      <DetailTableTd>{row.mengendapLabel}</DetailTableTd>
                      <DetailTableTd>
                        {row.emberPenugasan !== null
                          ? PROJECT_TASK_UNASSIGNED_LABEL
                          : "—"}
                      </DetailTableTd>
                    </DetailTableRow>
                  ))}
                </DetailTableBody>
              </DetailTable>
            </div>
          </section>

          <section aria-label={PROJECT_TASK_MENGENDAP_LABEL} className="border-t border-default">
            <h3 className="px-5 pt-3 text-xs font-semibold text-foreground">
              {PROJECT_TASK_MENGENDAP_LABEL}
            </h3>
            {mengendapRows.length === 0 ? (
              <EmptyState
                title={`${PROJECT_TASK_MENGENDAP_LABEL}: ${PROJECT_TASK_QUEUE_EMPTY_TEXT}`}
                className="py-6"
              />
            ) : (
              <div className="overflow-x-auto">
                <DetailTable data-report-table={PROJECT_TASK_MENGENDAP_LABEL}>
                  <DetailTableHead>
                    <DetailTableTh>{labels.name}</DetailTableTh>
                    <DetailTableTh>{labels.project}</DetailTableTh>
                    <DetailTableTh>{labels.assignee}</DetailTableTh>
                    <DetailTableTh>{labels.status}</DetailTableTh>
                    <DetailTableTh>{PROJECT_TASK_COLUMN_LABELS_TSQ.mengendap}</DetailTableTh>
                    <DetailTableTh>Penugasan</DetailTableTh>
                  </DetailTableHead>
                  <DetailTableBody>
                    {mengendapRows.map((row) => (
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
                        <DetailTableTd>{row.mengendapLabel}</DetailTableTd>
                        <DetailTableTd>
                          {row.emberPenugasan !== null
                            ? PROJECT_TASK_UNASSIGNED_LABEL
                            : "—"}
                        </DetailTableTd>
                      </DetailTableRow>
                    ))}
                  </DetailTableBody>
                </DetailTable>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  )
}
