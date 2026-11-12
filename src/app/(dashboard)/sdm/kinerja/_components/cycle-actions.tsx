"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import {
  createPerformanceCycle,
  finalizeReview,
  setPerformanceCycleStatus,
  submitManagerReview,
  submitSelfReview,
} from "@/actions/performance.actions"
import { showError, showSuccess } from "@/lib/utils/toast"
import { AppDatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/shadcn/button"
import { Plus } from "@/components/ui/fontawesome-icons"

export function CycleForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [periodStart, setPeriodStart] = useState("")
  const [periodEnd, setPeriodEnd] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  // Kunci idempotency per intent: stabil selama form tayang (retry jaringan
  // memakai key sama), diganti hanya sesudah siklus benar-benar lahir.
  const idempotencyKeyRef = useRef<string | null>(null)

  function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    if (idempotencyKeyRef.current === null) {
      idempotencyKeyRef.current = crypto.randomUUID()
    }
    formData.set("idempotencyKey", idempotencyKeyRef.current)
    if (periodStart) formData.set("periodStart", periodStart)
    if (periodEnd) formData.set("periodEnd", periodEnd)

    startTransition(async () => {
      try {
        const result = await createPerformanceCycle(formData)
        if (!result?.success) throw new Error(result?.error || "Gagal membuat siklus")
        idempotencyKeyRef.current = crypto.randomUUID()
        showSuccess("Siklus penilaian dibuat")
        form.reset()
        setPeriodStart("")
        setPeriodEnd("")
        setIsOpen(false)
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal membuat siklus")
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
          <span>Tambah Siklus Penilaian</span>
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-2xs">
      <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Formulir Tambah Siklus Evaluasi Kinerja</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Buka periode penilaian kinerja baru untuk evaluasi karyawan</p>
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
            <Label htmlFor="cycle-name">Nama Siklus <span className="text-destructive">*</span></Label>
            <Input id="cycle-name" name="name" required placeholder="mis. Semester 1 2026 / Tahunan 2026" />
          </div>

          <div className="flex flex-col gap-1.5">
            <AppDatePicker
              id="cycle-periodStart"
              name="periodStart"
              label="Periode Mulai *"
              value={periodStart}
              onChange={setPeriodStart}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <AppDatePicker
              id="cycle-periodEnd"
              name="periodEnd"
              label="Periode Akhir *"
              value={periodEnd}
              onChange={setPeriodEnd}
              required
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
            {isPending ? "Menyimpan..." : "Simpan Siklus"}
          </Button>
        </div>
      </form>
    </div>
  )
}

export function CycleStatusButton({
  cycleId,
  status,
  canEdit,
}: {
  cycleId: number
  status: string
  /** Izin edit_performance dari server. */
  canEdit: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const target = status === "draft" ? "active" : status === "active" ? "closed" : null
  if (!canEdit || !target) return null

  return (
    <button
      type="button"
      disabled={isPending}
      className="btn-secondary px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
      onClick={() => {
        startTransition(async () => {
          try {
            const result = await setPerformanceCycleStatus(cycleId, target)
            if (!result?.success) throw new Error(result?.error || "Gagal mengubah status")
            showSuccess("Status siklus diperbarui")
            router.refresh()
          } catch (error) {
            showError(error instanceof Error ? error.message : "Gagal mengubah status")
          }
        })
      }}
    >
      {isPending ? "Memproses..." : target === "active" ? "Aktifkan" : "Tutup Siklus"}
    </button>
  )
}

async function runAction(
  router: ReturnType<typeof useRouter>,
  fn: () => Promise<{ success: boolean; error?: string }>,
  okMessage: string,
) {
  try {
    const result = await fn()
    if (!result?.success) throw new Error(result?.error || "Gagal menyimpan")
    showSuccess(okMessage)
    router.refresh()
  } catch (error) {
    showError(error instanceof Error ? error.message : "Gagal menyimpan")
  }
}

export function SelfReviewForm({ cycleId, employeeId }: { cycleId: number; employeeId: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const score = Number(new FormData(event.currentTarget).get("selfScore"))
    startTransition(() => {
      void runAction(router, () => submitSelfReview(cycleId, employeeId, score), "Penilaian diri tersimpan")
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <input name="selfScore" type="number" min={0} max={100} step="0.01" required placeholder="Skor diri" className="form-input w-28" />
      <button type="submit" disabled={isPending} className="btn-secondary px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">
        Nilai Diri
      </button>
    </form>
  )
}

export function ManagerReviewForm({
  cycleId,
  employeeId,
  canEdit,
}: {
  cycleId: number
  employeeId: number
  /** Izin edit_performance dari server (submit + finalisasi). */
  canEdit: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (!canEdit) return null

  function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const fd = new FormData(event.currentTarget)
    const managerScore = Number(fd.get("managerScore"))
    const strengths = String(fd.get("strengths") ?? "") || undefined
    const improvements = String(fd.get("improvements") ?? "") || undefined
    startTransition(() => {
      void runAction(
        router,
        () => submitManagerReview(cycleId, employeeId, { managerScore, strengths, improvements }),
        "Ulasan atasan tersimpan",
      )
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input name="managerScore" type="number" min={0} max={100} step="0.01" required placeholder="Skor atasan" className="form-input w-28" />
        <button type="submit" disabled={isPending} className="btn-primary px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">
          Simpan Ulasan
        </button>
        <button
          type="button"
          disabled={isPending}
          className="btn-secondary px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
          onClick={() => {
            startTransition(() => {
              void runAction(router, () => finalizeReview(cycleId, employeeId), "Ulasan difinalisasi")
            })
          }}
        >
          Finalisasi
        </button>
      </div>
      <input name="strengths" placeholder="Kekuatan" className="form-input" />
      <input name="improvements" placeholder="Area perbaikan" className="form-input" />
    </form>
  )
}
