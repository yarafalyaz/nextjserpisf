"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import {
  approveSalaryAdjustment,
  cancelSalaryAdjustment,
  createSalaryAdjustment,
  rejectSalaryAdjustment,
} from "@/actions/salary-adjustment.actions"
import { Button } from "@/components/ui/button"
import { StatusChip } from "@/components/ui/status-chip"
import { AppDatePicker } from "@/components/ui/date-picker"
import { FormSelect } from "@/components/ui/form-select"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { statusLabel } from "@/lib/utils/status-labels"
import { showError, showSuccess } from "@/lib/utils/toast"
import {
  SALARY_ADJUSTMENT_REASON_LABELS,
  SALARY_ADJUSTMENT_REASONS,
} from "@/lib/utils/salary-adjustment-labels"

/**
 * F-2026-10-26-054-S (UI konsumen inti Backend): antrean persetujuan +
 * riwayat penyesuaian gaji satu karyawan. Semua angka/status/alasan dari
 * loader server (getSalaryAdjustments) ditampilkan apa adanya — UI tidak
 * menghitung ulang nominal, persen, atau kelayakan. Tombol putusan hanya
 * untuk status `menunggu`, dan mati (fail-closed) bila pemakai tidak
 * memegang izin approve_salary_adjustments atau adalah pengaju baris itu;
 * server tetap penegak akhir (maker-checker + klaim atomik).
 */
export interface SalaryAdjustmentRow {
  id: number
  effectiveDate: string
  previousBaseSalary: number
  newBaseSalary: number
  changePercent: number | null
  reason: string
  notes: string | null
  status: string
  appliedAt: string | null
  createdBy: number | null
  approvedBy: number | null
  rejectedBy: number | null
  rejectionReason: string | null
  decidedAt: string | null
  createdAt: string
}

export interface SalaryAdjustmentPanelProps {
  employeeId: number
  rows: SalaryAdjustmentRow[]
  /** Jumlah baris batal otomatis karena karyawan berhenti (Q-SA-3, dari server). */
  autoCancelledBerhenti: number
  /** Pesan gagal muat verbatim server; null = muat berhasil. */
  loadError: string | null
  canEdit: boolean
  canApprove: boolean
  currentUserId: number
}

type ActionResult = { success: boolean; error?: string } | undefined | null

export function SalaryAdjustmentPanel(props: SalaryAdjustmentPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rejectReasons, setRejectReasons] = useState<Record<number, string>>({})
  const [newBaseSalary, setNewBaseSalary] = useState("")
  const [effectiveDate, setEffectiveDate] = useState("")
  const [reason, setReason] = useState<string>("berkala")
  const [notes, setNotes] = useState("")

  function run(action: () => Promise<ActionResult>, successMessage: string) {
    startTransition(async () => {
      try {
        const result = await action()
        if (!result?.success) throw new Error(result?.error || "Aksi penyesuaian gaji gagal")
        showSuccess(successMessage)
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Aksi penyesuaian gaji gagal")
      }
    })
  }

  function onCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData()
    formData.set("employeeId", String(props.employeeId))
    formData.set("newBaseSalary", newBaseSalary)
    formData.set("effectiveDate", effectiveDate)
    formData.set("reason", reason)
    formData.set("notes", notes)
    run(async () => {
      const result = await createSalaryAdjustment(formData)
      if (result?.success) {
        setNewBaseSalary("")
        setEffectiveDate("")
        setNotes("")
      }
      return result
    }, "Pengajuan penyesuaian gaji dicatat dan menunggu persetujuan")
  }

  return (
    <section
      aria-labelledby="penyesuaian-gaji-heading"
      className="rounded-xl border border-default bg-surface shadow-sm overflow-hidden"
    >
      <div className="border-b border-default p-4 px-5">
        <h2 id="penyesuaian-gaji-heading" className="text-[0.9375rem] font-semibold text-foreground">
          Penyesuaian Gaji
        </h2>
      </div>
      <div className="flex flex-col gap-5 p-4 px-5">
        {props.canEdit ? (
          <form onSubmit={onCreate} aria-busy={isPending} className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="salary-new-base">Gaji Pokok Baru</Label>
                <Input
                  id="salary-new-base"
                  inputMode="numeric"
                  required
                  value={newBaseSalary}
                  onChange={(e) => setNewBaseSalary(e.target.value)}
                  placeholder="Cth. 5500000"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="salary-effective-date">Tanggal Efektif</Label>
                <AppDatePicker
                  name="salary-effective-date"
                  value={effectiveDate}
                  onChange={setEffectiveDate}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="salary-reason">Alasan</Label>
                <FormSelect
                  id="salary-reason"
                  value={reason}
                  onValueChange={setReason}
                  options={SALARY_ADJUSTMENT_REASONS.map((value) => ({
                    value,
                    label: SALARY_ADJUSTMENT_REASON_LABELS[value] ?? value,
                  }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="salary-notes">Catatan</Label>
                <Input
                  id="salary-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Catatan (opsional)"
                />
              </div>
            </div>
            <div>
              <Button type="submit" variant="primary" isDisabled={isPending || !effectiveDate}>
                Catat Kenaikan
              </Button>
            </div>
          </form>
        ) : null}

        {props.loadError ? (
          <p role="alert" className="text-sm text-danger">{props.loadError}</p>
        ) : props.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada penyesuaian gaji tercatat.</p>
        ) : (
          <>
            {props.autoCancelledBerhenti > 0 ? (
              <p className="text-sm text-muted-foreground">
                {props.autoCancelledBerhenti} penyesuaian dibatalkan otomatis karena karyawan telah berhenti.
              </p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm" aria-label="Daftar penyesuaian gaji">
                <thead>
                  <tr className="border-b border-default text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-2 pr-4 font-medium">Tanggal Efektif</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Gaji Sebelumnya</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Gaji Baru</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Perubahan</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Alasan</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Status</th>
                    <th scope="col" className="py-2 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {props.rows.map((row) => {
                    const isRequester = row.createdBy != null && row.createdBy === props.currentUserId
                    const canDecide = props.canApprove && !isRequester
                    return (
                      <tr key={row.id} className="border-b border-default align-top last:border-0">
                        <td className="py-2 pr-4">{formatDate(row.effectiveDate)}</td>
                        <td className="py-2 pr-4">{formatCurrency(row.previousBaseSalary)}</td>
                        <td className="py-2 pr-4">{formatCurrency(row.newBaseSalary)}</td>
                        <td className="py-2 pr-4">
                          {row.changePercent != null ? `${row.changePercent > 0 ? "+" : ""}${row.changePercent}%` : "-"}
                        </td>
                        <td className="py-2 pr-4">
                          {SALARY_ADJUSTMENT_REASON_LABELS[row.reason] ?? row.reason}
                          {row.notes ? <span className="block text-xs text-muted-foreground">{row.notes}</span> : null}
                        </td>
                        <td className="py-2 pr-4">
                          <StatusChip status={row.status} customLabel={statusLabel(row.status)} />
                          {row.rejectionReason ? (
                            <span className="block text-xs text-muted-foreground">{row.rejectionReason}</span>
                          ) : null}
                          {row.approvedBy != null ? (
                            <span className="block text-xs text-muted-foreground">Disetujui oleh pengguna #{row.approvedBy}</span>
                          ) : null}
                          {row.rejectedBy != null ? (
                            <span className="block text-xs text-muted-foreground">Ditolak oleh pengguna #{row.rejectedBy}</span>
                          ) : null}
                          {row.decidedAt ? (
                            <span className="block text-xs text-muted-foreground">Diputus {formatDate(row.decidedAt)}</span>
                          ) : null}
                        </td>
                        <td className="py-2">
                          {row.status === "menunggu" ? (
                            <div className="flex min-w-44 flex-col gap-2">
                              <Button
                                type="button"
                                variant="primary"
                                isDisabled={isPending || !canDecide}
                                onClick={() => run(() => approveSalaryAdjustment(row.id), "Penyesuaian gaji disetujui; menunggu penerapan pada tanggal efektif")}
                              >
                                Setujui
                              </Button>
                              <div className="flex flex-col gap-1.5">
                                <Label htmlFor={`salary-reject-reason-${row.id}`}>Alasan Penolakan</Label>
                                <Input
                                  id={`salary-reject-reason-${row.id}`}
                                  value={rejectReasons[row.id] ?? ""}
                                  onChange={(e) => setRejectReasons((p) => ({ ...p, [row.id]: e.target.value }))}
                                />
                              </div>
                              <Button
                                type="button"
                                variant="secondary"
                                isDisabled={isPending || !canDecide || !(rejectReasons[row.id] ?? "").trim()}
                                onClick={() => run(() => rejectSalaryAdjustment(row.id, rejectReasons[row.id] ?? ""), "Penyesuaian gaji ditolak")}
                              >
                                Tolak
                              </Button>
                              {!props.canApprove ? (
                                <span className="text-xs text-muted-foreground">Memerlukan izin menyetujui penyesuaian gaji</span>
                              ) : isRequester ? (
                                <span className="text-xs text-muted-foreground">Pengaju tidak dapat memutus penyesuaian sendiri</span>
                              ) : null}
                              {props.canEdit ? (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  isDisabled={isPending}
                                  onClick={() => run(() => cancelSalaryAdjustment(row.id), "Penyesuaian gaji dibatalkan")}
                                >
                                  Batalkan
                                </Button>
                              ) : null}
                            </div>
                          ) : row.status === "scheduled" && props.canEdit ? (
                            <Button
                              type="button"
                              variant="secondary"
                              isDisabled={isPending}
                              onClick={() => run(() => cancelSalaryAdjustment(row.id), "Penyesuaian gaji dibatalkan")}
                            >
                              Batalkan
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
