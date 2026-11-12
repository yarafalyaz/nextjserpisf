"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import {
  cancelSalaryAdjustment,
  createSalaryAdjustment,
} from "@/actions/salary-adjustment.actions"
import { showError, showSuccess } from "@/lib/utils/toast"
import { AppDatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/shadcn/input"

export function SalaryAdjustmentForm({ employeeId }: { employeeId: number }) {
  const router = useRouter()
  // Idempotency: key stabil per intent catat; retry jaringan memakai key
  // yang sama (ditolak server), sukses merotasi untuk pengajuan berikutnya.
  const idempotencyKeyRef = useRef<string | null>(null)
  if (idempotencyKeyRef.current === null) idempotencyKeyRef.current = crypto.randomUUID()
  const [isPending, startTransition] = useTransition()

  const [effectiveDate, setEffectiveDate] = useState("")

  function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    formData.set("employeeId", String(employeeId))
    formData.set("effectiveDate", effectiveDate)
    formData.set("idempotencyKey", idempotencyKeyRef.current!)
    startTransition(async () => {
      try {
        const result = await createSalaryAdjustment(formData)
        if (!result?.success) throw new Error(result?.error || "Gagal mencatat kenaikan")
        idempotencyKeyRef.current = crypto.randomUUID()
        showSuccess(
          result.applied
            ? `Kenaikan diterapkan (${result.changePercent != null ? `+${result.changePercent}%` : "baru"})`
            : "Kenaikan terjadwal dicatat",
        )
        setEffectiveDate("")
        form.reset()
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal mencatat kenaikan")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} aria-busy={isPending} className="grid grid-cols-1 sm:grid-cols-5 gap-3">
      <Input name="newBaseSalary" required placeholder="Gaji pokok baru (cth. 5500000)" className="font-mono tabular-nums text-right" />
      <AppDatePicker name="effectiveDate" value={effectiveDate} onChange={setEffectiveDate} placeholder="Tgl Efektif" />
      <select name="reason" className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" defaultValue="berkala">
        <option value="berkala">Kenaikan Berkala</option>
        <option value="promosi">Promosi</option>
        <option value="umk">Penyesuaian UMK/UMP</option>
        <option value="kinerja">Kinerja</option>
        <option value="penyesuaian">Penyesuaian Struktur</option>
        <option value="lainnya">Lainnya</option>
      </select>
      <Input name="notes" placeholder="Catatan" />
      <button type="submit" disabled={isPending || !effectiveDate} className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 disabled:opacity-50 disabled:pointer-events-none transition-colors">
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
      className="inline-flex items-center justify-center min-h-11 sm:min-h-9 px-2.5 py-1 rounded-md text-xs font-medium border border-border bg-card text-foreground hover:bg-muted transition-colors shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
