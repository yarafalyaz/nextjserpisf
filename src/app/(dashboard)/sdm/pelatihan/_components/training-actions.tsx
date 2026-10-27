"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import {
  addTrainingParticipant,
  createTraining,
  setParticipantResult,
  setTrainingStatus,
} from "@/actions/development.actions"
import { showError, showSuccess } from "@/lib/utils/toast"

export function TrainingForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    startTransition(async () => {
      try {
        const result = await createTraining(formData)
        if (!result?.success) throw new Error(result?.error || "Gagal membuat pelatihan")
        showSuccess("Pelatihan dibuat")
        form.reset()
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal membuat pelatihan")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} aria-busy={isPending} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <input name="title" required placeholder="Judul pelatihan" className="form-input" />
      <input name="provider" placeholder="Penyelenggara" className="form-input" />
      <input name="location" placeholder="Lokasi" className="form-input" />
      <input name="startDate" type="date" required className="form-input" />
      <input name="endDate" type="date" className="form-input" />
      <input name="cost" placeholder="Biaya (cth. 1500000)" className="form-input" />
      <button type="submit" disabled={isPending} className="btn-primary px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 sm:col-span-3">
        {isPending ? "Menyimpan..." : "Buat Pelatihan"}
      </button>
    </form>
  )
}

export function ParticipantForm({
  trainingId,
  employees,
}: {
  trainingId: number
  employees: { id: number; name: string }[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    formData.set("trainingId", String(trainingId))
    startTransition(async () => {
      try {
        const result = await addTrainingParticipant(formData)
        if (!result?.success) throw new Error(result?.error || "Gagal menambah peserta")
        showSuccess("Peserta ditambahkan")
        form.reset()
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menambah peserta")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <select name="employeeId" required className="form-input" defaultValue="">
        <option value="" disabled>Pilih karyawan</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>
      <button type="submit" disabled={isPending} className="btn-secondary px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">
        Tambah Peserta
      </button>
    </form>
  )
}

export function ParticipantResultButtons({ participantId }: { participantId: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function mark(status: "attended" | "absent") {
    startTransition(async () => {
      try {
        const result = await setParticipantResult(participantId, { status })
        if (!result?.success) throw new Error(result?.error || "Gagal menyimpan hasil")
        showSuccess("Hasil peserta disimpan")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan hasil")
      }
    })
  }

  return (
    <div className="flex gap-2">
      <button type="button" disabled={isPending} onClick={() => mark("attended")} className="btn-secondary px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">
        Hadir
      </button>
      <button type="button" disabled={isPending} onClick={() => mark("absent")} className="btn-secondary px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">
        Absen
      </button>
    </div>
  )
}

export function TrainingStatusButton({ trainingId, status }: { trainingId: number; status: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  if (status !== "scheduled") return null

  function setStatus(next: "done" | "cancelled") {
    startTransition(async () => {
      try {
        const result = await setTrainingStatus(trainingId, next)
        if (!result?.success) throw new Error(result?.error || "Gagal mengubah status")
        showSuccess("Status pelatihan diperbarui")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal mengubah status")
      }
    })
  }

  return (
    <div className="flex gap-2">
      <button type="button" disabled={isPending} onClick={() => setStatus("done")} className="btn-primary px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">
        Selesai
      </button>
      <button type="button" disabled={isPending} onClick={() => setStatus("cancelled")} className="btn-secondary px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">
        Batalkan
      </button>
    </div>
  )
}
