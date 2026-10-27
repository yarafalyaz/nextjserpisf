"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import {
  cancelSalaryAdjustment,
  createSalaryAdjustment,
} from "@/actions/salary-adjustment.actions"
import { showError, showSuccess } from "@/lib/utils/toast"

export function SalaryAdjustmentForm({ employeeId }: { employeeId: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    formData.set("employeeId", String(employeeId))
    startTransition(async () => {
      try {
        const result = await createSalaryAdjustment(formData)
        if (!result?.success) throw new Error(result?.error || "Gagal mencatat kenaikan")
        showSuccess(
          result.applied
            ? `Kenaikan diterapkan (${result.changePercent != null ? `+${result.changePercent}%` : "baru"})`
            : "Kenaikan terjadwal dicatat",
        )
        form.reset()
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal mencatat kenaikan")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} aria-busy={isPending} className="grid grid-cols-1 sm:grid-cols-5 gap-3">
      <input name="newBaseSalary" required placeholder="Gaji pokok baru (cth. 5500000)" className="form-input" />
      <input name="effectiveDate" type="date" required className="form-input" />
      <select name="reason" className="form-input" defaultValue="berkala">
        <option value="berkala">Kenaikan Berkala</option>
        <option value="promosi">Promosi</option>
        <option value="umk">Penyesuaian UMK/UMP</option>
        <option value="kinerja">Kinerja</option>
        <option value="penyesuaian">Penyesuaian Struktur</option>
        <option value="lainnya">Lainnya</option>
      </select>
      <input name="notes" placeholder="Catatan" className="form-input" />
      <button type="submit" disabled={isPending} className="btn-primary px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
        {isPending ? "Menyimpan..." : "Catat Kenaikan"}
      </button>
    </form>
  )
}

export function CancelSalaryAdjustmentButton({ id }: { id: number }) {
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
            const result = await cancelSalaryAdjustment(id)
            if (!result?.success) throw new Error(result?.error || "Gagal membatalkan")
            showSuccess("Kenaikan terjadwal dibatalkan")
            router.refresh()
          } catch (error) {
            showError(error instanceof Error ? error.message : "Gagal membatalkan")
          }
        })
      }}
    >
      Batalkan
    </button>
  )
}
