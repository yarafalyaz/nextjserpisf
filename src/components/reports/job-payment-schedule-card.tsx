"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Percent } from "lucide-react"
import type { JobPaymentScheduleResult } from "@/lib/reports/job-payment-schedule-data"
import {
  cancelJobPaymentSchedule,
  createJobPaymentSchedule,
  updateJobPaymentScheduleTerms,
  type JobPaymentTermWriteInput,
} from "@/actions/job-payment-schedule.actions"
import { createProgressInvoice } from "@/actions/sales.actions"
import { formatCurrency, formatDate, formatPercentage } from "@/lib/utils/format"
import { showError, showSuccess } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Kartu jadwal termin F-2026-10-22-067-S (AC-TM67-6..8).
 *
 * Menyatu di kartu tagihan job (JobBillingCard). Semua angka/status
 * dari loader server apa adanya — UI tidak menghitung target/status
 * sendiri. Label "Jadwal kesepakatan" dari server dibedakan dari
 * label turunan existing. Kandidat termin berikutnya menaut ke aksi
 * progres existing createProgressInvoice, bukan tombol terbit baru.
 * Tanpa izin kelola (edit_quotations) tampil baca-saja.
 */

interface TermDraft {
  key: number
  name: string
  cumulativePercent: string
  dueDate: string
  milestoneLabel: string
}

let draftKey = 0
function nextKey() {
  draftKey += 1
  return draftKey
}

function toDateInputValue(dueDate: Date | string): string {
  const d = typeof dueDate === "string" ? new Date(dueDate) : dueDate
  if (Number.isNaN(d.getTime())) return ""
  // ponytail: tanggal kalender WIB dari Date server; pakai UTC+7 tetap seperti builder wibCalendarDay.
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000)
  const y = wib.getUTCFullYear()
  const m = String(wib.getUTCMonth() + 1).padStart(2, "0")
  const day = String(wib.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function statusTone(status: string): string {
  switch (status) {
    case "terpenuhi":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
    case "terpenuhi_sebagian":
      return "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400"
    case "jatuh_tempo":
      return "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
    default:
      return "bg-muted text-muted-foreground"
  }
}

const inputClass = "min-h-11 rounded-lg border border-default bg-background px-2 text-sm"

export function JobPaymentScheduleCard({
  schedule,
  quotationId,
  canManage,
}: Readonly<{
  schedule: JobPaymentScheduleResult | null
  quotationId: number
  canManage: boolean
}>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [formOpen, setFormOpen] = useState(false)
  const [drafts, setDrafts] = useState<TermDraft[]>([])
  const [reason, setReason] = useState("")
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState("")

  const editing = schedule !== null
  const hasFulfilled = schedule?.terms.some((t) => t.status === "terpenuhi") ?? false
  const nextTerm = schedule?.terms.find((t) => t.id === schedule.nextTermId) ?? null

  function run(fn: () => Promise<{ success: boolean; error?: string }>, okMsg: string, after?: () => void) {
    startTransition(async () => {
      try {
        const res = await fn()
        if (res?.success) {
          showSuccess(okMsg)
          after?.()
          router.refresh()
        } else {
          showError(res?.error || "Gagal memproses jadwal termin")
        }
      } catch (e) {
        showError(e instanceof Error ? e.message : "Gagal memproses jadwal termin")
      }
    })
  }

  function openCreate() {
    setDrafts([{ key: nextKey(), name: "", cumulativePercent: "", dueDate: "", milestoneLabel: "" }])
    setReason("")
    setFormOpen(true)
  }

  function openEdit() {
    if (!schedule) return
    setDrafts(
      schedule.terms.map((t) => ({
        key: nextKey(),
        name: t.name,
        cumulativePercent: String(t.cumulativePercent),
        dueDate: toDateInputValue(t.dueDate),
        milestoneLabel: t.milestoneLabel ?? "",
      })),
    )
    setReason("")
    setFormOpen(true)
  }

  function patchDraft(key: number, patch: Partial<TermDraft>) {
    setDrafts((p) => p.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  }

  function submitForm() {
    if (drafts.length === 0) {
      showError("Jadwal termin wajib memiliki minimal satu baris termin")
      return
    }
    const terms: JobPaymentTermWriteInput[] = drafts.map((d) => ({
      name: d.name.trim(),
      cumulativePercent: Number(d.cumulativePercent),
      dueDate: d.dueDate,
      milestoneLabel: d.milestoneLabel.trim() || null,
    }))
    if (editing && schedule) {
      run(
        () => updateJobPaymentScheduleTerms({ scheduleId: schedule.scheduleId, terms, reason: reason.trim() || undefined }),
        "Jadwal termin diperbarui",
        () => setFormOpen(false),
      )
    } else {
      run(
        () => createJobPaymentSchedule({ quotationId, terms }),
        "Jadwal termin dibuat",
        () => setFormOpen(false),
      )
    }
  }

  function tagihTerminBerikutnya() {
    if (!nextTerm) return
    startTransition(async () => {
      try {
        const result = await createProgressInvoice(quotationId, nextTerm.cumulativePercent)
        if (!result.success) {
          showError(result.error || "Gagal membuat faktur progres")
          return
        }
        showSuccess("Faktur progres dibuat")
        if (result.slug) router.push(`/penjualan/faktur/${result.slug}`)
        else router.refresh()
      } catch (e) {
        showError(e instanceof Error ? e.message : "Gagal membuat faktur progres")
      }
    })
  }

  return (
    <section aria-label="Jadwal termin" className="mt-4 border-t border-default pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Jadwal Termin</h3>
        {canManage && !schedule ? (
          <Button variant="secondary" size="sm" isDisabled={isPending} onPress={openCreate}>
            + Jadwal Termin
          </Button>
        ) : null}
        {canManage && schedule ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" isDisabled={isPending} onPress={openEdit}>
              Ubah Jadwal
            </Button>
            <Button
              variant="danger-soft"
              size="sm"
              isDisabled={isPending}
              onPress={() => {
                setCancelReason("")
                setCancelOpen(true)
              }}
            >
              Batalkan Jadwal
            </Button>
          </div>
        ) : null}
      </div>

      {!schedule ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">Belum ada jadwal termin untuk penawaran ini.</p>
          {!canManage ? (
            <p className="mt-1 text-xs text-muted-foreground">Hanya baca: kelola jadwal memerlukan izin edit_quotations.</p>
          ) : null}
        </>
      ) : (
        <>
          <p className="mt-0.5 text-xs text-muted-foreground">{schedule.scheduleLabel}</p>
          <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Nilai kontrak</dt>
              <dd className="font-semibold tabular-nums">{formatCurrency(schedule.contractValue)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Sudah ditagih</dt>
              <dd className="tabular-nums">{formatCurrency(schedule.billedAmount)}</dd>
            </div>
          </dl>

          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-2 font-medium">Termin</th>
                  <th className="py-1 pr-2 font-medium text-right">Target kumulatif</th>
                  <th className="py-1 pr-2 font-medium text-right">Nominal termin</th>
                  <th className="py-1 pr-2 font-medium text-right">Terpenuhi</th>
                  <th className="py-1 pr-2 font-medium">Jatuh tempo</th>
                  <th className="py-1 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {schedule.terms.map((term) => (
                  <tr key={term.id} className="border-t border-default">
                    <td className="py-1.5 pr-2">
                      <span className="font-medium text-foreground">{term.name}</span>
                      {term.milestoneLabel ? (
                        <span className="block text-xs text-muted-foreground">{term.milestoneLabel}</span>
                      ) : null}
                      {term.id === schedule.nextTermId ? (
                        <span className="block text-xs font-medium text-foreground">Termin berikutnya</span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {formatPercentage(term.cumulativePercent, 1)} · {formatCurrency(term.targetAmount)}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{formatCurrency(term.termAmount)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{formatCurrency(term.fulfilledAmount)}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{formatDate(term.dueDate)}</td>
                    <td className="py-1.5">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", statusTone(term.status))}>
                        {term.statusLabel}
                      </span>
                      {term.overdue ? <span className="ml-1 text-xs text-destructive">Terlambat</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {schedule.allFulfilled ? (
            <p role="status" className="mt-2 text-sm text-muted-foreground">
              Semua termin terpenuhi.
            </p>
          ) : nextTerm ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground">
                Termin berikutnya: <span className="font-medium text-foreground">{nextTerm.name}</span> — target kumulatif{" "}
                {formatPercentage(nextTerm.cumulativePercent, 1)} ({formatCurrency(nextTerm.targetAmount)})
              </p>
              <Button
                variant="secondary"
                size="sm"
                isPending={isPending}
                isDisabled={isPending}
                aria-label={`Buat faktur progres termin ${nextTerm.name}`}
                onPress={tagihTerminBerikutnya}
              >
                <Percent size={14} aria-hidden="true" /> Buat Faktur Progres
              </Button>
            </div>
          ) : null}

          {!canManage ? (
            <p className="mt-2 text-xs text-muted-foreground">Hanya baca: kelola jadwal memerlukan izin edit_quotations.</p>
          ) : null}
        </>
      )}

      {formOpen && canManage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editing ? "Ubah jadwal termin" : "Buat jadwal termin"}
        >
          <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-xl border border-default bg-surface p-5 shadow-lg">
            <h3 className="text-base font-semibold text-foreground">{editing ? "Ubah Jadwal Termin" : "Buat Jadwal Termin"}</h3>
            <p className="text-xs text-muted-foreground">
              Persen kumulatif naik ketat dan termin terakhir persis 100. Target nominal dihitung server dari nilai kontrak berjalan.
            </p>
            <div className="flex flex-col gap-2">
              {drafts.map((draft, idx) => (
                <div key={draft.key} className="flex flex-wrap items-end gap-2 rounded-lg border border-default p-2">
                  <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs">
                    Nama termin <span aria-hidden="true" className="text-destructive">*</span>
                    <input
                      aria-label={`Nama termin ${idx + 1}`}
                      value={draft.name}
                      onChange={(e) => patchDraft(draft.key, { name: e.target.value })}
                      required
                      aria-required="true"
                      className={inputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    Persen kumulatif (%) <span aria-hidden="true" className="text-destructive">*</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="any"
                      aria-label={`Persen kumulatif termin ${idx + 1}`}
                      value={draft.cumulativePercent}
                      onChange={(e) => patchDraft(draft.key, { cumulativePercent: e.target.value })}
                      required
                      aria-required="true"
                      className={`${inputClass} w-28`}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    Tanggal jatuh tempo <span aria-hidden="true" className="text-destructive">*</span>
                    <input
                      type="date"
                      aria-label={`Tanggal jatuh tempo termin ${idx + 1}`}
                      value={draft.dueDate}
                      onChange={(e) => patchDraft(draft.key, { dueDate: e.target.value })}
                      required
                      aria-required="true"
                      className={inputClass}
                    />
                  </label>
                  <label className="flex min-w-36 flex-1 flex-col gap-1 text-xs">
                    Label milestone (opsional)
                    <input
                      aria-label={`Label milestone termin ${idx + 1}`}
                      value={draft.milestoneLabel}
                      onChange={(e) => patchDraft(draft.key, { milestoneLabel: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                  <Button
                    variant="danger-soft"
                    size="sm"
                    isDisabled={isPending}
                    aria-label={`Hapus termin ${idx + 1}`}
                    onPress={() => setDrafts((p) => p.filter((d) => d.key !== draft.key))}
                  >
                    Hapus Baris
                  </Button>
                </div>
              ))}
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  isDisabled={isPending}
                  onPress={() =>
                    setDrafts((p) => [...p, { key: nextKey(), name: "", cumulativePercent: "", dueDate: "", milestoneLabel: "" }])
                  }
                >
                  + Baris Termin
                </Button>
              </div>
            </div>

            {editing ? (
              <div className="flex flex-col gap-1">
                <label htmlFor="jadwal-termin-reason" className="text-sm font-medium text-foreground">
                  Alasan perubahan{hasFulfilled ? (
                    <>
                      {" "}
                      <span aria-hidden="true" className="text-destructive">*</span>
                    </>
                  ) : (
                    " (opsional)"
                  )}
                </label>
                <textarea
                  id="jadwal-termin-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required={hasFulfilled}
                  aria-required={hasFulfilled ? "true" : undefined}
                  rows={2}
                  className="rounded-lg border border-default bg-background px-3 py-2 text-sm"
                />
                {hasFulfilled ? (
                  <p className="text-xs text-muted-foreground">Wajib sesudah ada termin terpenuhi.</p>
                ) : null}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" isDisabled={isPending} onPress={() => setFormOpen(false)}>
                Batal
              </Button>
              <Button variant="primary" isPending={isPending} isDisabled={isPending} onPress={submitForm}>
                {editing ? "Simpan Jadwal" : "Buat Jadwal"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelOpen && canManage && schedule ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Batalkan jadwal termin"
        >
          <div className="flex w-full max-w-lg flex-col gap-4 rounded-xl border border-default bg-surface p-5 shadow-lg">
            <h3 className="text-base font-semibold text-foreground">Batalkan Jadwal Termin</h3>
            <div className="flex flex-col gap-1">
              <label htmlFor="jadwal-termin-cancel-reason" className="text-sm font-medium text-foreground">
                Alasan pembatalan <span aria-hidden="true" className="text-destructive">*</span>
              </label>
              <textarea
                id="jadwal-termin-cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                required
                aria-required="true"
                rows={2}
                className="rounded-lg border border-default bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" isDisabled={isPending} onPress={() => setCancelOpen(false)}>
                Kembali
              </Button>
              <Button
                variant="danger"
                isPending={isPending}
                isDisabled={isPending || !cancelReason.trim()}
                onPress={() =>
                  run(
                    () => cancelJobPaymentSchedule({ scheduleId: schedule.scheduleId, reason: cancelReason.trim() }),
                    "Jadwal termin dibatalkan",
                    () => setCancelOpen(false),
                  )
                }
              >
                Batalkan Jadwal
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
