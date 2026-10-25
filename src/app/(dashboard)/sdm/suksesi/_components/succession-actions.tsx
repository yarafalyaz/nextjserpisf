"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import {
  removeSuccessorCandidate,
  setPositionCritical,
  upsertSuccessorCandidate,
} from "@/actions/succession.actions"
import { showError, showSuccess } from "@/lib/utils/toast"

export function CriticalToggle({
  positionId,
  isCritical,
}: {
  positionId: number
  isCritical: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={isPending}
      className="btn-secondary px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
      onClick={() => {
        startTransition(async () => {
          try {
            const result = await setPositionCritical(positionId, !isCritical)
            if (!result?.success) throw new Error(result?.error || "Gagal mengubah status")
            showSuccess("Status jabatan kritis diperbarui")
            router.refresh()
          } catch (error) {
            showError(error instanceof Error ? error.message : "Gagal mengubah status")
          }
        })
      }}
    >
      {isCritical ? "Cabut Status Kritis" : "Jadikan Kritis"}
    </button>
  )
}

export function SuccessorForm({
  positions,
  employees,
}: {
  positions: { id: number; name: string }[]
  employees: { id: number; name: string }[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    startTransition(async () => {
      try {
        const result = await upsertSuccessorCandidate(formData)
        if (!result?.success) throw new Error(result?.error || "Gagal menetapkan kandidat")
        showSuccess("Kandidat suksesi ditetapkan")
        form.reset()
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menetapkan kandidat")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} aria-busy={isPending} className="grid grid-cols-1 sm:grid-cols-5 gap-3">
      <select name="positionId" required className="form-input" defaultValue="">
        <option value="" disabled>Jabatan kritis</option>
        {positions.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <select name="candidateEmployeeId" required className="form-input" defaultValue="">
        <option value="" disabled>Kandidat pengganti</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>
      <select name="readiness" className="form-input" defaultValue="ready_future">
        <option value="ready_now">Siap Sekarang</option>
        <option value="ready_1_2_years">Siap 1-2 Tahun</option>
        <option value="ready_future">Siap Masa Depan</option>
      </select>
      <input name="rank" type="number" min={1} max={99} defaultValue={1} className="form-input" />
      <button type="submit" disabled={isPending} className="btn-primary px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
        Tetapkan Kandidat
      </button>
    </form>
  )
}

export function RemoveSuccessorButton({ id }: { id: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={isPending}
      className="btn-secondary px-2 py-1 rounded-lg text-xs font-medium disabled:opacity-50"
      onClick={() => {
        startTransition(async () => {
          try {
            const result = await removeSuccessorCandidate(id)
            if (!result?.success) throw new Error(result?.error || "Gagal menghapus kandidat")
            showSuccess("Kandidat dihapus")
            router.refresh()
          } catch (error) {
            showError(error instanceof Error ? error.message : "Gagal menghapus kandidat")
          }
        })
      }}
    >
      Hapus
    </button>
  )
}
