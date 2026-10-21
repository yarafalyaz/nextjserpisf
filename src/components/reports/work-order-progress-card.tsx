import type {
  WorkOrderProgressReport,
} from "@/lib/reports/work-order-progress"
import { formatNumber, formatPercentage } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"
import { Progress } from "@/components/ui/shadcn/progress"
import { ReportCardShell } from "./report-card-shell"
import type { ReactNode } from "react"

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu",
  in_progress: "Dalam Proses",
  completed: "Selesai",
  skipped: "Dilewati",
}

/**
 * F-2026-10-21-020 Tahap B: kartu progres tahap WO di detail WO.
 * Murni presentasi dari builder `buildWorkOrderProgress` / loader
 * `getWorkOrderProgress`: x/y + persen tampil apa adanya, UI tidak
 * menghitung ulang. Semua skipped -> percent null -> "tidak ada tahap
 * aktif", bukan 100%. Aksi transisi dirender komponen client terpisah
 * lewat prop `actions` per tahap; server penegak izin/aturan.
 */
export function WorkOrderProgressCard({
  progress,
  actions,
  initAction,
}: Readonly<{
  progress: WorkOrderProgressReport
  actions?: Record<number, ReactNode>
  initAction?: ReactNode
}>) {
  const allSkipped =
    progress.hasStages &&
    progress.percent === null &&
    progress.skippedCount === progress.totalStages

  const summary = allSkipped
    ? "tidak ada tahap aktif"
    : progress.percent !== null
      ? `${progress.completedCount}/${progress.denominator} tahap selesai (${formatPercentage(progress.percent, 1)})`
      : `${progress.completedCount}/${progress.denominator} tahap selesai`

  return (
    <ReportCardShell
      label="Progres Tahap Perintah Kerja"
      title="Progres Tahap Perintah Kerja"
      summary={summary}
      isEmpty={false}
      emptyText=""
    >
      {!progress.hasStages ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-muted-foreground">
            Belum ada tahap tercatat untuk perintah kerja ini
          </p>
          {initAction ?? null}
        </div>
      ) : (
        <>
          {progress.percent !== null ? (
            <Progress value={progress.percent} className="mb-4" />
          ) : null}
          <ol className="flex flex-col gap-4">
            {progress.rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-start justify-between gap-3"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-foreground">
                    {row.sortOrder}. {row.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    <StatusChip
                      status={row.status}
                      customLabel={STATUS_LABEL[row.status] ?? row.status}
                    />
                    {row.estimatedHours !== null
                      ? ` Estimasi ${formatNumber(row.estimatedHours, 2)} jam`
                      : ""}
                  </span>
                  {row.notes ? (
                    <span className="text-xs text-muted-foreground">
                      {row.status === "skipped" ? "Alasan dilewati: " : "Catatan: "}
                      {row.notes}
                    </span>
                  ) : null}
                  {!row.isActionable && row.blockedByName ? (
                    <span className="text-xs text-amber-700">
                      Menunggu tahap {row.blockedByName} selesai
                    </span>
                  ) : null}
                </div>
                {actions?.[row.id] ?? null}
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="mt-4 text-sm text-muted-foreground">{progress.notice}</p>
    </ReportCardShell>
  )
}
