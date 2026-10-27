"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import type {
  CloseoutAgeBucket,
  CloseoutCheckState,
  CloseoutQueueJob,
  WorkshopCloseoutQueue,
} from "@/lib/reports/workshop-closeout-queue"
import {
  WORKSHOP_CLOSEOUT_QUEUE_EMPTY_TEXT,
  WORKSHOP_CLOSEOUT_QUEUE_NOTICE_TEXT,
  WORKSHOP_CLOSEOUT_QUEUE_TITLE,
} from "@/lib/reports/workshop-closeout-queue"
import { closeProductionOrder, closeWorkOrder } from "@/actions/manufacturing.actions"
import { useActionRunner } from "./use-action-runner"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { entityHref } from "@/lib/utils/entity-url"
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils/format"
import { statusLabel } from "@/lib/utils/status-labels"

/**
 * F-2026-10-24-097-S S3: antrean "Job Selesai Belum Ditutup".
 * Data dari loader server-only `getWorkshopCloseoutQueue` (builder murni
 * BOT Backend PR #704): status C1-C8, blockers, readyToClose, dan pesan
 * ditampilkan apa adanya — UI TIDAK menghitung ulang biaya/WIP/status.
 * Aksi tutup memanggil server action existing; pesan server tampil verbatim
 * lewat useActionRunner. Izin tombol diputus page (canClose*) dari
 * permission page; server tetap penegak tunggal.
 */

const CHECK_LABELS: { key: "c1" | "c2" | "c3" | "c4" | "c5" | "c6" | "c7" | "c8"; label: string }[] = [
  { key: "c1", label: "Perintah produksi anak selesai" },
  { key: "c2", label: "Tidak ada pengeluaran material terbuka" },
  { key: "c3", label: "Semua biaya produksi terposting" },
  { key: "c4", label: "Sisa WIP nol / selesai penuh" },
  { key: "c5", label: "QC / NCR bersih" },
  { key: "c6", label: "Periode tanggal tutup terbuka" },
  { key: "c7", label: "Tagihan vendor/subkontrak (periksa manual)" },
  { key: "c8", label: "Biaya timesheet ditarik (periksa manual)" },
]

function CheckMark({ check }: Readonly<{ check: CloseoutCheckState }>) {
  if (check.passed === true) return <span aria-label="Lolos" title="Lolos">✓</span>
  if (check.passed === false) return <span aria-label="Menahan tutup" title="Menahan tutup">✗</span>
  return <span aria-label="Belum dinilai / periksa manual" title="Belum dinilai / periksa manual">?</span>
}

function jobDetailHref(job: CloseoutQueueJob): string {
  return job.kind === "work_order"
    ? entityHref("/produksi/perintah-kerja", job)
    : entityHref("/produksi/production-orders", job)
}

export function WorkshopCloseoutQueueCard({
  queue,
  canCloseWorkOrder,
  canCloseProductionOrder,
}: Readonly<{
  queue: WorkshopCloseoutQueue
  canCloseWorkOrder: boolean
  canCloseProductionOrder: boolean
}>) {
  const [bucketFilter, setBucketFilter] = useState<string>("all")
  const [pendingJob, setPendingJob] = useState<CloseoutQueueJob | null>(null)
  const [reason, setReason] = useState("")
  const { isPending, run } = useActionRunner("Gagal menutup job. Silakan coba lagi.")

  const visibleJobs = useMemo(
    () => (bucketFilter === "all" ? queue.jobs : queue.jobs.filter((j) => j.ageBucket === bucketFilter)),
    [queue.jobs, bucketFilter],
  )

  const canClose = (job: CloseoutQueueJob) =>
    job.kind === "work_order" ? canCloseWorkOrder : canCloseProductionOrder

  function submitClose() {
    if (!pendingJob) return
    const job = pendingJob
    const trimmed = reason.trim()
    run(
      () =>
        job.kind === "work_order"
          ? closeWorkOrder(job.id, trimmed)
          : closeProductionOrder(job.id, trimmed),
      `Job ditutup. Status kini ${statusLabel("closed")}.`,
      () => {
        setPendingJob(null)
        setReason("")
      },
    )
  }

  return (
    <section
      aria-label={WORKSHOP_CLOSEOUT_QUEUE_TITLE}
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          {WORKSHOP_CLOSEOUT_QUEUE_TITLE}
        </h2>
        <p className="text-xs text-muted-foreground">
          {formatNumber(queue.totalJobs)} job selesai belum ditutup ·{" "}
          {formatNumber(queue.readyCount)} siap tutup · {formatNumber(queue.blockedCount)}{" "}
          tertahan
        </p>
      </div>
      <div className="p-4 px-5 flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">{WORKSHOP_CLOSEOUT_QUEUE_NOTICE_TEXT}</p>

        {queue.jobs.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            {WORKSHOP_CLOSEOUT_QUEUE_EMPTY_TEXT}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter ember umur">
              <button
                type="button"
                className={`filter-chip ${bucketFilter === "all" ? "active" : ""}`}
                aria-pressed={bucketFilter === "all"}
                onClick={() => setBucketFilter("all")}
              >
                Semua ({formatNumber(queue.totalJobs)})
              </button>
              {queue.buckets.map((bucket: CloseoutAgeBucket) => (
                <button
                  key={bucket.id}
                  type="button"
                  className={`filter-chip ${bucketFilter === bucket.id ? "active" : ""}`}
                  aria-pressed={bucketFilter === bucket.id}
                  onClick={() => setBucketFilter(bucket.id)}
                >
                  {bucket.label} ({formatNumber(bucket.jobCount)} · {formatNumber(bucket.readyCount)}{" "}
                  siap)
                </button>
              ))}
            </div>

            {visibleJobs.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                Tidak ada job pada ember umur ini.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {visibleJobs.map((job) => {
                  const bucket = queue.buckets.find((b) => b.id === job.ageBucket)
                  return (
                    <li
                      key={`${job.kind}-${job.id}`}
                      className="rounded-lg border border-default p-3 flex flex-col gap-2"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex flex-col gap-0.5">
                          <Link
                            href={jobDetailHref(job)}
                            className="font-medium text-primary hover:underline"
                          >
                            {job.code}
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            {job.kind === "work_order" ? "Perintah Kerja" : "Perintah Produksi"}
                            {job.kind === "work_order"
                              ? job.vehicleLabel
                                ? ` · ${job.vehicleLabel}${job.plateNumber ? ` (${job.plateNumber})` : ""}`
                                : job.plateNumber
                                  ? ` · ${job.plateNumber}`
                                  : ""
                              : job.productName
                                ? ` · ${job.productName}`
                                : ""}
                            {job.customerName ? ` · ${job.customerName}` : ""}
                            {job.kind === "production_order" && job.workOrderDocumentNo
                              ? ` · WO ${job.workOrderDocumentNo}`
                              : ""}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
                          <span>
                            Selesai {formatDate(job.completedAt)} · {formatNumber(job.ageDays)}{" "}
                            hari lalu
                            {bucket ? ` · ${bucket.label}` : ""}
                            {job.completedAtSource === "updatedAt"
                              ? " · tanggal perkiraan (baris legacy)"
                              : ""}
                          </span>
                          {job.kind === "production_order" && job.totalActualCost != null ? (
                            <span>Sisa WIP {formatCurrency(job.totalActualCost)}</span>
                          ) : null}
                          <span
                            className={
                              job.readyToClose
                                ? "font-medium text-success"
                                : "font-medium text-destructive"
                            }
                          >
                            {job.readyToClose ? "Siap tutup" : "Belum siap tutup"}
                          </span>
                        </div>
                      </div>

                      <ul className="grid gap-1 text-xs sm:grid-cols-2" aria-label={`Checklist ${job.code}`}>
                        {CHECK_LABELS.map(({ key, label }) => (
                          <li key={key} className="flex items-start gap-1.5">
                            <CheckMark check={job[key]} />
                            <span>
                              <span className="font-medium">{label}:</span> {job[key].detail}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {job.blockers.length > 0 ? (
                        <div className="text-xs text-destructive">
                          <p className="font-medium">Penghambat tutup:</p>
                          <ul className="list-disc pl-4">
                            {job.blockers.map((blocker) => (
                              <li key={blocker}>{blocker}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {canClose(job) ? (
                        <div>
                          <button
                            type="button"
                            className="inline-flex min-h-11 items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover transition-all disabled:opacity-50"
                            disabled={!job.readyToClose || isPending}
                            aria-label={`Tutup Job ${job.code}`}
                            onClick={() => {
                              setPendingJob(job)
                              setReason("")
                            }}
                          >
                            Tutup Job (Close-out)
                          </button>
                          {!job.readyToClose ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Selesaikan penghambat di atas sebelum menutup job.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={pendingJob !== null}
        onOpenChange={(open) => {
          if (!open) setPendingJob(null)
        }}
        title={pendingJob ? `Tutup Job ${pendingJob.code}?` : "Tutup Job"}
        confirmLabel="Ya, Tutup Job"
        variant="primary"
        isPending={isPending}
        onConfirm={submitClose}
      >
        <div className="flex flex-col gap-3">
          <p>
            Job berstatus closed membekukan mutasi biaya. Alasan wajib diisi dan tercatat di jejak
            aktivitas.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="closeout-reason">Alasan Penutupan</Label>
            <Textarea
              id="closeout-reason"
              rows={3}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: rekonsiliasi C1-C8 bersih; tagihan vendor nihil."
            />
          </div>
          {reason.trim() === "" ? (
            <p className="text-xs text-muted-foreground">Isi alasan untuk melanjutkan.</p>
          ) : null}
        </div>
      </ConfirmDialog>
    </section>
  )
}
