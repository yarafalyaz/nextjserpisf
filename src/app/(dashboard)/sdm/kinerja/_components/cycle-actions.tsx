"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import {
  createPerformanceCycle,
  finalizeReview,
  setPerformanceCycleStatus,
  submitManagerReview,
  submitSelfReview,
} from "@/actions/performance.actions"
import { showError, showSuccess } from "@/lib/utils/toast"

export function CycleForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    startTransition(async () => {
      try {
        const result = await createPerformanceCycle(formData)
        if (!result?.success) throw new Error(result?.error || "Gagal membuat siklus")
        showSuccess("Siklus penilaian dibuat")
        form.reset()
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal membuat siklus")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} aria-busy={isPending} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
      <input name="name" required placeholder="Nama siklus (cth. Semester 1 2026)" className="form-input" />
      <input name="periodStart" type="date" required className="form-input" />
      <input name="periodEnd" type="date" required className="form-input" />
      <button type="submit" disabled={isPending} className="btn-primary px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
        {isPending ? "Menyimpan..." : "Buat Siklus"}
      </button>
    </form>
  )
}

export function CycleStatusButton({ cycleId, status }: { cycleId: number; status: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const target = status === "draft" ? "active" : status === "active" ? "closed" : null
  if (!target) return null

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

export function ManagerReviewForm({ cycleId, employeeId }: { cycleId: number; employeeId: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

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
