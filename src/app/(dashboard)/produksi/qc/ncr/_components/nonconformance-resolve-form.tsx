"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { resolveNonconformance } from "@/actions/qc.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select"
import { Button } from "@/components/ui/button"

const STATUS_OPTIONS = [
  { value: "rework", label: "Dikerjakan ulang (rework)" },
  { value: "rework_done", label: "Rework selesai" },
  { value: "rejected", label: "Ditolak" },
  { value: "closed", label: "Ditutup (selesai)" },
]

export function NonconformanceResolveForm({
  ncrId,
  currentStatus,
  canManage,
}: {
  ncrId: number
  currentStatus: string
  canManage: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState("rework")

  if (!canManage) return null
  if (currentStatus === "closed") {
    return <p className="text-sm text-muted-foreground">NCR sudah ditutup.</p>
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("status", status)

    startTransition(async () => {
      const result = await resolveNonconformance(ncrId, formData)
      if (result && !result.success) {
        showError(result.error || "Gagal memperbarui NCR")
        return
      }
      showSuccess("NCR diperbarui")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <h3 className="text-base font-semibold text-foreground mb-4">Perbarui / Selesaikan NCR</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status">Status Baru *</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="status"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reworkHours">Jam Rework</Label>
          <Input id="reworkHours" name="reworkHours" type="number" step="0.01" min="0" defaultValue="0" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reworkCost">Biaya Rework</Label>
          <Input id="reworkCost" name="reworkCost" type="number" step="0.01" min="0" defaultValue="0" />
        </div>

        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="resolution">Resolusi / Tindakan</Label>
          <Textarea id="resolution" name="resolution" rows={3} placeholder="Tindakan perbaikan yang dilakukan" />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="submit" variant="primary" isDisabled={isPending} id="submit-resolve-ncr">
          {isPending ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
