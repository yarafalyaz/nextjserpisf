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

export function ApplicantStageSelect({
  applicantId,
  stage,
  disabled,
}: {
  applicantId: number
  stage: string
  disabled: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

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

export function HireButton({ applicantId, disabled }: { applicantId: number; disabled: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={disabled || isPending}
      className="btn-primary px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
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
}: {
  vacancyId: number
  status: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const target = status === "draft" ? "open" : status === "open" ? "closed" : null
  if (!target) return null
  const label = target === "open" ? "Buka Lowongan" : "Tutup Lowongan"

  return (
    <button
      type="button"
      disabled={isPending}
      className="btn-secondary px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
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
