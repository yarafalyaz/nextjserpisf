"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { UserCheck, Plus } from "lucide-react"
import { Button } from "@/components/ui/shadcn/button"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { FormSelect } from "@/components/ui/form-select"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { showSuccess, showError } from "@/lib/utils/toast"
import { convertLead, addLeadActivity } from "@/actions/crm.actions"

/** Convert-to-customer button. Shown only when the lead is convertible + not yet converted. */
export function ConvertLeadButton({ leadId, canConvert }: { leadId: number; canConvert: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  if (!canConvert) return null

  function handleConvert() {
    startTransition(async () => {
      const res = await convertLead(leadId)
      if (!res.success) {
        showError(res.error || "Gagal mengonversi lead")
        setOpen(false)
        return
      }
      showSuccess("Lead berhasil dikonversi menjadi pelanggan")
      setOpen(false)
      router.push(`/master/pelanggan/${res.customerId}`)
      router.refresh()
    })
  }

  return (
    <>
      <Button type="button" variant="default" size="sm" onClick={() => setOpen(true)} disabled={isPending}>
        <UserCheck size={14} aria-hidden="true" /> Konversi ke Pelanggan
      </Button>
      <ConfirmDialog
        isOpen={open}
        onOpenChange={setOpen}
        title="Konversi lead menjadi pelanggan?"
        body="Lead akan ditandai 'won' dan pelanggan baru dibuat dari data lead ini. Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Konversi"
        cancelLabel="Batal"
        isPending={isPending}
        onConfirm={handleConvert}
      />
    </>
  )
}

/** Inline form to log a lead activity (note/call/email/meeting/task). */
export function AddLeadActivityForm({ leadId }: { leadId: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [type, setType] = useState("note")

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    startTransition(async () => {
      const fd = new FormData(form)
      fd.set("type", type)
      const res = await addLeadActivity(leadId, fd)
      if (!res.success) {
        showError(res.error || "Gagal menambahkan aktivitas")
        return
      }
      showSuccess("Aktivitas ditambahkan")
      form.reset()
      setType("note")
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-2 p-4 px-5 border-b border-default">
      <div className="flex flex-col gap-1.5 sm:w-40">
        <Label htmlFor="activityType">Tipe</Label>
        <FormSelect
          id="activityType"
          value={type}
          onValueChange={setType}
          options={[
            { value: "note", label: "Catatan" },
            { value: "call", label: "Telepon" },
            { value: "email", label: "Email" },
            { value: "meeting", label: "Rapat" },
            { value: "task", label: "Tugas" },
          ]}
        />
      </div>
      <div className="flex flex-col gap-1.5 sm:flex-1">
        <Label htmlFor="activitySubject">Subjek *</Label>
        <Input id="activitySubject" name="subject" required placeholder="Ringkasan aktivitas..." />
      </div>
      <div className="flex flex-col gap-1.5 sm:flex-1">
        <Label htmlFor="activityDesc">Deskripsi</Label>
        <Textarea id="activityDesc" name="description" rows={1} placeholder="Detail (opsional)..." />
      </div>
      <Button type="submit" size="sm" disabled={isPending}>
        <Plus size={14} aria-hidden="true" /> {isPending ? "Menyimpan..." : "Tambah"}
      </Button>
    </form>
  )
}
