"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import {
  openProbation,
  closeProbation,
  saveProbationReviewDraft,
  submitProbationReview,
  decideProbation,
  createContractDecisionRequest,
  submitContractDecisionRequest,
  approveContractDecisionRequest,
  rejectContractDecisionRequest,
  cancelContractDecisionRequest,
  applyContractDecisionRequest,
} from "@/actions/probation.actions"
import { showError, showSuccess } from "@/lib/utils/toast"
import { formatDate } from "@/lib/utils/format"
import {
  PROBATION_SCORE_LABELS,
  PROBATION_SCORE_CATEGORIES,
  PROBATION_RECOMMENDATION_LABELS,
  PROBATION_RECOMMENDATIONS,
  PROBATION_FINAL_DECISION_LABELS,
  PROBATION_FINAL_DECISIONS,
  CONTRACT_DECISION_KIND_LABELS,
  probationScoreLabel,
  probationRecommendationLabel,
  type ProbationScoreCategory,
  type ProbationRecommendation,
} from "@/lib/reports/probation"
import { Button } from "@/components/ui/button"
import { AppDatePicker } from "@/components/ui/date-picker"
import { FormSelect } from "@/components/ui/form-select"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"

export interface ProbationMilestoneRow {
  milestone: string
  label: string
  dueDate: string
  isFinal: boolean
  reviewStatus: string | null
  reviewId: number | null
  reviewerEmployeeId: number | null
  technicalScore: string | null
  disciplineScore: string | null
  attendanceScore: string | null
  notes: string | null
  recommendation: string | null
}

export interface ContractDecisionRow {
  id: number
  kind: string
  kindLabel: string
  proposedContractEndDate: string | null
  reason: string
  status: string
  statusLabel: string
  rejectionReason: string | null
  createdAt: string
}

export interface ProbationContractPanelProps {
  employeeId: number
  employmentStatus: string | null
  employmentStatusLabel: string
  joinDate: string
  probationEndDate: string | null
  derivedStatusLabel: string | null
  milestones: ProbationMilestoneRow[]
  decisions: ContractDecisionRow[]
  decisionsError: string | null
  reviewerOptions: { id: number; name: string }[]
  canEdit: boolean
  canApprove: boolean
}

const REVIEW_STATUS_LABELS: Record<string, string> = {
  draft: "Draf",
  submitted: "Terkirim",
  decided: "Diputus",
}

function notesRequired(scores: (string | null)[], recommendation: string | null): boolean {
  if (scores.includes("perlu_perhatian")) return true
  // Rekomendasi kosong = belum dipilih; server mewajibkan catatan hanya
  // sesudah rekomendasi terpilih bukan "lanjut".
  return recommendation != null && recommendation !== "" && recommendation !== "lanjut"
}

export function ProbationContractPanel(props: ProbationContractPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [openEnd, setOpenEnd] = useState("")
  const [reviewForms, setReviewForms] = useState<Record<string, {
    reviewerEmployeeId: string
    technicalScore: string
    disciplineScore: string
    attendanceScore: string
    notes: string
    recommendation: string
  }>>({})
  const [finalDecision, setFinalDecision] = useState("")
  const [extendedEnd, setExtendedEnd] = useState("")
  const [decisionKind, setDecisionKind] = useState("")
  const [decisionEnd, setDecisionEnd] = useState("")
  const [decisionReason, setDecisionReason] = useState("")
  const [rejectReasons, setRejectReasons] = useState<Record<number, string>>({})
  const [cancelReasons, setCancelReasons] = useState<Record<number, string>>({})

  function run(fn: () => Promise<{ success: boolean; error?: string }>, okMsg: string) {
    startTransition(async () => {
      try {
        const result = await fn()
        if (!result.success) throw new Error(result.error || "Gagal menyimpan data")
        showSuccess(okMsg)
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  function reviewForm(m: ProbationMilestoneRow) {
    return reviewForms[m.milestone] ?? {
      reviewerEmployeeId: m.reviewerEmployeeId ? String(m.reviewerEmployeeId) : "",
      technicalScore: m.technicalScore ?? "",
      disciplineScore: m.disciplineScore ?? "",
      attendanceScore: m.attendanceScore ?? "",
      notes: m.notes ?? "",
      recommendation: m.recommendation ?? "",
    }
  }

  function patchReview(milestone: string, patch: Partial<ReturnType<typeof reviewForm>>) {
    setReviewForms((prev) => ({
      ...prev,
      [milestone]: { ...(prev[milestone] ?? {
        reviewerEmployeeId: "", technicalScore: "", disciplineScore: "",
        attendanceScore: "", notes: "", recommendation: "",
      }), ...patch },
    }))
  }

  const scoreOptions = PROBATION_SCORE_CATEGORIES.map((v) => ({
    value: v,
    label: PROBATION_SCORE_LABELS[v as ProbationScoreCategory],
  }))
  const recommendationOptions = PROBATION_RECOMMENDATIONS.map((v) => ({
    value: v,
    label: PROBATION_RECOMMENDATION_LABELS[v as ProbationRecommendation],
  }))

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="masa-percobaan-heading" className="rounded-xl border border-default bg-surface shadow-sm overflow-hidden">
        <div className="border-b border-default p-4 px-5">
          <h2 id="masa-percobaan-heading" className="text-[0.9375rem] font-semibold text-foreground">Masa Percobaan</h2>
        </div>
        <div className="flex flex-col gap-5 p-4 px-5">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Status Kepegawaian</dt>
              <dd className="mt-0.5 font-medium text-foreground">{props.employmentStatusLabel}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Tanggal Masuk</dt>
              <dd className="mt-0.5 font-medium text-foreground">{formatDate(props.joinDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Status Percobaan</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {props.probationEndDate
                  ? (props.derivedStatusLabel ?? "Dalam percobaan")
                  : "Tidak dalam percobaan"}
              </dd>
            </div>
          </dl>

          {props.probationEndDate ? (
            <>
              <p className="text-sm text-muted-foreground">
                Tanggal akhir masa percobaan: <span className="font-medium text-foreground">{formatDate(props.probationEndDate)}</span>
              </p>
              {props.canEdit && (
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    isDisabled={isPending}
                    onClick={() => run(() => closeProbation(props.employeeId), "Masa percobaan ditutup")}
                  >
                    Tutup Masa Percobaan
                  </Button>
                </div>
              )}
              <div className="flex flex-col gap-4">
                {props.milestones.map((m) => {
                  const form = reviewForm(m)
                  const editable = props.canEdit && m.reviewStatus !== "submitted" && m.reviewStatus !== "decided"
                  const needNotes = notesRequired(
                    [form.technicalScore || null, form.disciplineScore || null, form.attendanceScore || null],
                    form.recommendation || null,
                  )
                  return (
                    <fieldset key={m.milestone} className="rounded-lg border border-default p-4">
                      <legend className="px-1 text-sm font-semibold text-foreground">
                        {m.isFinal ? `${m.label} (Final)` : m.label}
                      </legend>
                      <p className="text-xs text-muted-foreground">
                        Jatuh tempo: {formatDate(m.dueDate)} — Status: {m.reviewStatus ? (REVIEW_STATUS_LABELS[m.reviewStatus] ?? m.reviewStatus) : "belum diisi"}
                      </p>
                      {m.reviewStatus && m.reviewStatus !== "draft" ? (
                        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                          <div>
                            <dt className="text-xs text-muted-foreground">Teknis</dt>
                            <dd>{probationScoreLabel(m.technicalScore) ?? "-"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Disiplin</dt>
                            <dd>{probationScoreLabel(m.disciplineScore) ?? "-"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Kehadiran</dt>
                            <dd>{probationScoreLabel(m.attendanceScore) ?? "-"}</dd>
                          </div>
                          <div className="sm:col-span-3">
                            <dt className="text-xs text-muted-foreground">Rekomendasi</dt>
                            <dd>{probationRecommendationLabel(m.recommendation) ?? "-"}</dd>
                          </div>
                          <div className="sm:col-span-3">
                            <dt className="text-xs text-muted-foreground">Catatan</dt>
                            <dd>{m.notes ? m.notes : "-"}</dd>
                          </div>
                        </dl>
                      ) : editable ? (
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor={`reviewer-${m.milestone}`}>Penilai</Label>
                            <FormSelect
                              id={`reviewer-${m.milestone}`}
                              value={form.reviewerEmployeeId}
                              onValueChange={(v) => patchReview(m.milestone, { reviewerEmployeeId: v })}
                              options={props.reviewerOptions.map((r) => ({ value: String(r.id), label: r.name }))}
                              placeholder="-- Pilih penilai --"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor={`technical-${m.milestone}`}>Teknis</Label>
                            <FormSelect
                              id={`technical-${m.milestone}`}
                              value={form.technicalScore}
                              onValueChange={(v) => patchReview(m.milestone, { technicalScore: v })}
                              options={scoreOptions}
                              placeholder="-- Pilih kategori --"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor={`discipline-${m.milestone}`}>Disiplin</Label>
                            <FormSelect
                              id={`discipline-${m.milestone}`}
                              value={form.disciplineScore}
                              onValueChange={(v) => patchReview(m.milestone, { disciplineScore: v })}
                              options={scoreOptions}
                              placeholder="-- Pilih kategori --"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor={`attendance-${m.milestone}`}>Kehadiran</Label>
                            <FormSelect
                              id={`attendance-${m.milestone}`}
                              value={form.attendanceScore}
                              onValueChange={(v) => patchReview(m.milestone, { attendanceScore: v })}
                              options={scoreOptions}
                              placeholder="-- Pilih kategori --"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor={`recommendation-${m.milestone}`}>Rekomendasi</Label>
                            <FormSelect
                              id={`recommendation-${m.milestone}`}
                              value={form.recommendation}
                              onValueChange={(v) => patchReview(m.milestone, { recommendation: v })}
                              options={recommendationOptions}
                              placeholder="-- Pilih rekomendasi --"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5 sm:col-span-2">
                            <Label htmlFor={`notes-${m.milestone}`}>
                              Catatan{needNotes ? <span className="text-destructive" aria-hidden="true"> *</span> : null}
                            </Label>
                            <Textarea
                              id={`notes-${m.milestone}`}
                              value={form.notes}
                              onChange={(e) => patchReview(m.milestone, { notes: e.target.value })}
                              required={needNotes}
                              aria-required={needNotes}
                              rows={3}
                              placeholder={needNotes ? "Catatan wajib diisi untuk rekomendasi ini" : "Catatan evaluasi"}
                            />
                            {needNotes && (
                              <p className="text-xs text-muted-foreground">
                                Catatan wajib diisi bila ada sumbu Perlu Perhatian atau rekomendasi bukan Lanjut.
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 sm:col-span-2">
                            <Button
                              type="button"
                              variant="secondary"
                              isDisabled={isPending}
                              onClick={() => run(() => saveProbationReviewDraft({
                                employeeId: props.employeeId,
                                milestone: m.milestone,
                                reviewerEmployeeId: Number(form.reviewerEmployeeId),
                                technicalScore: form.technicalScore || null,
                                disciplineScore: form.disciplineScore || null,
                                attendanceScore: form.attendanceScore || null,
                                notes: form.notes.trim() ? form.notes : null,
                                recommendation: form.recommendation || null,
                              }), "Draf evaluasi disimpan")}
                            >
                              Simpan Draf
                            </Button>
                            {m.reviewId != null && (
                              <Button
                                type="button"
                                isDisabled={isPending}
                                onClick={() => run(() => submitProbationReview(m.reviewId as number), "Evaluasi dikirim")}
                              >
                                Kirim Evaluasi
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-muted-foreground">belum diisi</p>
                      )}
                    </fieldset>
                  )
                })}
              </div>

              {props.canApprove && (
                <fieldset className="rounded-lg border border-default p-4">
                  <legend className="px-1 text-sm font-semibold text-foreground">Keputusan Kontrak</legend>
                  <p className="mb-3 text-xs text-muted-foreground">Keputusan akhir masa percobaan hanya dapat diputus pemegang izin menyetujui kontrak.</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="final-decision">Keputusan Akhir</Label>
                      <FormSelect
                        id="final-decision"
                        value={finalDecision}
                        onValueChange={setFinalDecision}
                        options={PROBATION_FINAL_DECISIONS.map((v) => ({ value: v, label: PROBATION_FINAL_DECISION_LABELS[v] }))}
                        placeholder="-- Pilih keputusan --"
                      />
                    </div>
                    {finalDecision === "extended" && (
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="extended-end">Tanggal Akhir Percobaan Baru</Label>
                        <AppDatePicker name="extended-end" value={extendedEnd} onChange={setExtendedEnd} />
                      </div>
                    )}
                  </div>
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="primary"
                      isDisabled={isPending || !finalDecision}
                      onClick={() => run(
                        () => decideProbation(props.employeeId, finalDecision, finalDecision === "extended" ? extendedEnd || null : null),
                        "Keputusan akhir masa percobaan disimpan",
                      )}
                    >
                      Putuskan Masa Percobaan
                    </Button>
                  </div>
                </fieldset>
              )}
            </>
          ) : props.canEdit ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="probation-end">Tanggal Akhir Masa Percobaan</Label>
                <AppDatePicker name="probation-end" value={openEnd} onChange={setOpenEnd} />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="primary"
                  isDisabled={isPending || !openEnd}
                  onClick={() => run(() => openProbation(props.employeeId, openEnd), "Masa percobaan dibuka")}
                >
                  Buka Masa Percobaan
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Karyawan ini tidak dalam masa percobaan.</p>
          )}
        </div>
      </section>

      <section aria-labelledby="keputusan-kontrak-heading" className="rounded-xl border border-default bg-surface shadow-sm overflow-hidden">
        <div className="border-b border-default p-4 px-5">
          <h2 id="keputusan-kontrak-heading" className="text-[0.9375rem] font-semibold text-foreground">Keputusan Kontrak</h2>
        </div>
        <div className="flex flex-col gap-5 p-4 px-5">
          {props.decisionsError ? (
            <p role="alert" className="text-sm text-danger">{props.decisionsError}</p>
          ) : props.decisions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada pengajuan keputusan kontrak.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm" aria-label="Daftar pengajuan keputusan kontrak">
                <thead>
                  <tr className="border-b border-default text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-2 pr-4 font-medium">Jenis Keputusan</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Tanggal Akhir Usulan</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Status</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Alasan</th>
                    <th scope="col" className="py-2 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {props.decisions.map((d) => (
                    <tr key={d.id} className="border-b border-default align-top last:border-0">
                      <td className="py-2 pr-4">{d.kindLabel}</td>
                      <td className="py-2 pr-4">{d.proposedContractEndDate ? formatDate(d.proposedContractEndDate) : "-"}</td>
                      <td className="py-2 pr-4">
                        {d.statusLabel}
                        {d.rejectionReason ? <span className="block text-xs text-muted-foreground">{d.rejectionReason}</span> : null}
                      </td>
                      <td className="py-2 pr-4">{d.reason}</td>
                      <td className="py-2">
                        <div className="flex min-w-44 flex-col gap-2">
                          {props.canEdit && d.status === "draft" && (
                            <Button type="button" variant="secondary" isDisabled={isPending} onClick={() => run(() => submitContractDecisionRequest(d.id), "Pengajuan diajukan")}>
                              Ajukan
                            </Button>
                          )}
                          {props.canApprove && d.status === "submitted" && (
                            <>
                              <Button type="button" variant="primary" isDisabled={isPending} onClick={() => run(() => approveContractDecisionRequest(d.id), "Pengajuan disetujui")}>
                                Setujui
                              </Button>
                              <div className="flex flex-col gap-1.5">
                                <Label htmlFor={`reject-reason-${d.id}`}>Alasan Penolakan</Label>
                                <Input
                                  id={`reject-reason-${d.id}`}
                                  value={rejectReasons[d.id] ?? ""}
                                  onChange={(e) => setRejectReasons((p) => ({ ...p, [d.id]: e.target.value }))}
                                />
                              </div>
                              <Button
                                type="button"
                                variant="secondary"
                                isDisabled={isPending || !(rejectReasons[d.id] ?? "").trim()}
                                onClick={() => run(() => rejectContractDecisionRequest(d.id, rejectReasons[d.id] ?? ""), "Pengajuan ditolak")}
                              >
                                Tolak
                              </Button>
                            </>
                          )}
                          {props.canEdit && d.status === "approved" && (
                            <Button type="button" variant="primary" isDisabled={isPending} onClick={() => run(() => applyContractDecisionRequest(d.id), "Keputusan kontrak diterapkan")}>
                              Terapkan
                            </Button>
                          )}
                          {props.canEdit && (d.status === "draft" || d.status === "submitted") && (
                            <>
                              <div className="flex flex-col gap-1.5">
                                <Label htmlFor={`cancel-reason-${d.id}`}>Alasan Pembatalan</Label>
                                <Input
                                  id={`cancel-reason-${d.id}`}
                                  value={cancelReasons[d.id] ?? ""}
                                  onChange={(e) => setCancelReasons((p) => ({ ...p, [d.id]: e.target.value }))}
                                />
                              </div>
                              <Button
                                type="button"
                                variant="secondary"
                                isDisabled={isPending || !(cancelReasons[d.id] ?? "").trim()}
                                onClick={() => run(() => cancelContractDecisionRequest(d.id, cancelReasons[d.id] ?? ""), "Pengajuan dibatalkan")}
                              >
                                Batalkan
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {props.canEdit && (
            <fieldset className="rounded-lg border border-default p-4">
              <legend className="px-1 text-sm font-semibold text-foreground">Ajukan Keputusan Kontrak</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="decision-kind">Jenis Keputusan</Label>
                  <FormSelect
                    id="decision-kind"
                    value={decisionKind}
                    onValueChange={setDecisionKind}
                    options={Object.entries(CONTRACT_DECISION_KIND_LABELS).map(([value, label]) => ({ value, label }))}
                    placeholder="-- Pilih jenis keputusan --"
                  />
                </div>
                {decisionKind === "extend_pkwt" && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="decision-end">Tanggal Akhir Kontrak Usulan</Label>
                    <AppDatePicker name="decision-end" value={decisionEnd} onChange={setDecisionEnd} />
                  </div>
                )}
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="decision-reason">Alasan Pengajuan</Label>
                  <Textarea
                    id="decision-reason"
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                    rows={3}
                    placeholder="Alasan pengajuan keputusan kontrak"
                  />
                </div>
              </div>
              <div className="mt-3">
                <Button
                  type="button"
                  variant="primary"
                  isDisabled={isPending || !decisionKind || !decisionReason.trim() || (decisionKind === "extend_pkwt" && !decisionEnd)}
                  onClick={() => run(() => createContractDecisionRequest({
                    employeeId: props.employeeId,
                    kind: decisionKind,
                    proposedContractEndDate: decisionKind === "extend_pkwt" ? decisionEnd || null : null,
                    reason: decisionReason,
                  }), "Pengajuan keputusan kontrak dibuat")}
                >
                  Buat Pengajuan
                </Button>
              </div>
            </fieldset>
          )}
        </div>
      </section>
    </div>
  )
}
