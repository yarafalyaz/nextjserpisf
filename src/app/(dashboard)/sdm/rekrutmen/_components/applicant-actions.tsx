"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import {
  hireApplicant,
  moveApplicantStage,
  setVacancyStatus,
} from "@/actions/recruitment.actions"
import { showError, showSuccess } from "@/lib/utils/toast"

const STAGE_OPTIONS = [
  { value: "applied", label: "Melamar" },
  { value: "screening", label: "Seleksi Berkas" },
  { value: "interview", label: "Wawancara" },
  { value: "offering", label: "Penawaran" },
  { value: "rejected", label: "Ditolak" },
]

const STAGE_LABELS: Record<string, string> = {
  applied: "Melamar",
  screening: "Seleksi Berkas",
  interview: "Wawancara",
  offering: "Penawaran",
  hired: "Diterima",
  rejected: "Ditolak",
}

export function ApplicantStageSelect({
  applicantId,
  stage,
  disabled,
  canEdit,
}: {
  applicantId: number
  stage: string
  disabled: boolean
  /** Izin edit_recruitments dari server — tanpa ini tampil label baca saja. */
  canEdit: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (!canEdit) return <>{STAGE_LABELS[stage] ?? stage}</>

  return (
    <select
      value={stage}
      disabled={disabled || isPending}
      className="form-input"
      onChange={(e) => {
        const toStage = e.target.value
        startTransition(async () => {
          try {
            const result = await moveApplicantStage(applicantId, toStage)
            if (!result?.success) throw new Error(result?.error || "Gagal memindah tahapan")
            showSuccess("Tahapan diperbarui")
            router.refresh()
          } catch (error) {
            showError(error instanceof Error ? error.message : "Gagal memindah tahapan")
            router.refresh()
          }
        })
      }}
    >
      {stage === "hired" ? (
        <option value="hired">Diterima</option>
      ) : (
        STAGE_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))
      )}
    </select>
  )
}

export function HireButton({
  applicantId,
  disabled,
  canEdit,
}: {
  applicantId: number
  disabled: boolean
  /** Izin edit_recruitments dari server. */
  canEdit: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (!canEdit) return null

  return (
    <button
      type="button"
      disabled={disabled || isPending}
      className="inline-flex items-center justify-center min-h-11 sm:min-h-9 px-3.5 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      onClick={() => {
        startTransition(async () => {
          try {
            const result = await hireApplicant(applicantId)
            if (!result?.success) throw new Error(result?.error || "Gagal menerima pelamar")
            showSuccess(`Karyawan dibuat: ${result.employeeNo}`)
            router.refresh()
          } catch (error) {
            showError(error instanceof Error ? error.message : "Gagal menerima pelamar")
          }
        })
      }}
    >
      {isPending ? "Memproses..." : "Terima Jadi Karyawan"}
    </button>
  )
}

export function VacancyStatusButton({
  vacancyId,
  status,
  canEdit,
}: {
  vacancyId: number
  status: string
  /** Izin edit_recruitments dari server. */
  canEdit: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const target = status === "draft" ? "open" : status === "open" ? "closed" : null
  if (!canEdit || !target) return null
  const label = target === "open" ? "Buka Lowongan" : "Tutup Lowongan"

  return (
    <button
      type="button"
      disabled={isPending}
      className="inline-flex items-center justify-center min-h-11 sm:min-h-9 px-3.5 py-1.5 rounded-md text-xs font-medium border border-border bg-card text-foreground hover:bg-muted transition-colors shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      onClick={() => {
        startTransition(async () => {
          try {
            const result = await setVacancyStatus(vacancyId, target)
            if (!result?.success) throw new Error(result?.error || "Gagal mengubah status")
            showSuccess("Status lowongan diperbarui")
            router.refresh()
          } catch (error) {
            showError(error instanceof Error ? error.message : "Gagal mengubah status")
          }
        })
      }}
    >
      {isPending ? "Memproses..." : label}
    </button>
  )
}
