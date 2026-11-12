"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import {
  addTrainingParticipant,
  createTraining,
  setParticipantResult,
  setTrainingStatus,
} from "@/actions/development.actions"
import { showError, showSuccess } from "@/lib/utils/toast"
import { AppDatePicker } from "@/components/ui/date-picker"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/shadcn/button"
import { Plus } from "@/components/ui/fontawesome-icons"

export function TrainingForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [cost, setCost] = useState<number>(0)
  const [isOpen, setIsOpen] = useState(false)
  // Putaran 68: key stabil per intent; form tetap mounted sesudah sukses
  // (form.reset), jadi key dirotasi sesudah sukses.
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())

  function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    formData.set("idempotencyKey", idempotencyKeyRef.current)
    if (startDate) formData.set("startDate", startDate)
    if (endDate) formData.set("endDate", endDate)
    formData.set("cost", String(cost))

    startTransition(async () => {
      try {
        const result = await createTraining(formData)
        if (!result?.success) throw new Error(result?.error || "Gagal membuat pelatihan")
        idempotencyKeyRef.current = crypto.randomUUID()
        showSuccess("Pelatihan dibuat")
        form.reset()
        setStartDate("")
        setEndDate("")
        setCost(0)
        setIsOpen(false)
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal membuat pelatihan")
      }
    })
  }

  if (!isOpen) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          <span>Tambah Pelatihan</span>
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-2xs">
      <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Formulir Tambah Program Pelatihan</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Daftarkan agenda training atau peningkatan kompetensi SDM baru</p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          Tutup
        </button>
      </div>

      <form onSubmit={onSubmit} aria-busy={isPending} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="training-title">Judul Pelatihan <span className="text-destructive">*</span></Label>
            <Input id="training-title" name="title" required placeholder="mis. Sertifikasi ISO 9001" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="training-provider">Penyelenggara</Label>
            <Input id="training-provider" name="provider" placeholder="mis. Lembaga Sertifikasi Nasional" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="training-location">Lokasi</Label>
            <Input id="training-location" name="location" placeholder="mis. Ruang Training A / Online Zoom" />
          </div>

          <div className="flex flex-col gap-1.5">
            <AppDatePicker
              id="training-startDate"
              name="startDate"
              label="Tanggal Mulai *"
              value={startDate}
              onChange={setStartDate}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <AppDatePicker
              id="training-endDate"
              name="endDate"
              label="Tanggal Selesai"
              value={endDate}
              onChange={setEndDate}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="training-cost">Biaya Pelatihan</Label>
            <CurrencyInput
              id="training-cost"
              name="cost"
              value={cost}
              onChange={(val) => setCost(val)}
              placeholder="0"
              prefix="Rp"
              className="font-mono text-sm tabular-nums"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsOpen(false)}
            className="min-h-11 sm:min-h-9"
          >
            Batal
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={isPending}
            className="min-h-11 sm:min-h-9"
          >
            {isPending ? "Menyimpan..." : "Simpan Pelatihan"}
          </Button>
        </div>
      </form>
    </div>
  )
}

export function ParticipantForm({
  trainingId,
  employees,
  canEdit,
}: {
  trainingId: number
  employees: { id: number; name: string }[]
  /** Izin edit_trainings dari server. */
  canEdit: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (!canEdit) return null

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

export function ParticipantResultButtons({
  participantId,
  canEdit,
}: {
  participantId: number
  /** Izin edit_trainings dari server. */
  canEdit: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (!canEdit) return null

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

export function TrainingStatusButton({
  trainingId,
  status,
  canEdit,
}: {
  trainingId: number
  status: string
  /** Izin edit_trainings dari server. */
  canEdit: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  if (!canEdit || status !== "scheduled") return null

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
