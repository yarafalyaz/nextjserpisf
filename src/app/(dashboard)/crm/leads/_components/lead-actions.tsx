"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { UserCheck, Plus, Check, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/shadcn/button"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { FormSelect } from "@/components/ui/form-select"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { showSuccess, showError } from "@/lib/utils/toast"
import { convertLead, addLeadActivity, completeLeadActivity, reopenLeadActivity } from "@/actions/crm.actions"
import { LEAD_ACTIVITY_TYPE_LABELS, LEAD_ACTIVITY_TYPE_OPTIONS } from "@/lib/utils/status-labels"

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
        showError(res.error || "Gagal mengonversi prospek")
        setOpen(false)
        return
      }
      showSuccess("Prospek berhasil dikonversi menjadi pelanggan")
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
        title="Konversi prospek menjadi pelanggan?"
        body="Prospek akan ditandai 'Menang' dan pelanggan baru dibuat dari data prospek ini. Tindakan ini tidak dapat dibatalkan."
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
          options={LEAD_ACTIVITY_TYPE_OPTIONS.map((value) => ({
            value,
            label: LEAD_ACTIVITY_TYPE_LABELS[value],
          }))}
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

/**
 * F-2026-10-25-008-S: tombol penanda selesai / batal-selesai aktivitas lead
 * terjadwal. `canAct` dihitung server di halaman detail dari gerbang yang sama
 * dengan server action (edit_leads + pemilik atau manage_leads/super_admin,
 * BR-LC-02) — komponen ini tidak menilai kepemilikan/izin sendiri. Aktivitas
 * tanpa jadwal + belum selesai tidak mendapat tombol apa pun (BR-LC-05).
 * completedAt selalu waktu server; klien tidak mengirim tanggal.
 * Spesifikasi: backlog F-2026-10-25-008-S §2/§6, AC-LC-F1/F2.
 */
export function LeadActivityCompletionButton({
  leadId,
  activityId,
  subject,
  completedAt,
  canAct,
}: {
  leadId: number
  activityId: number
  subject?: string | null
  completedAt: boolean
  canAct: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (!canAct) return null

  function handleClick() {
    startTransition(async () => {
      const res = completedAt
        ? await reopenLeadActivity(leadId, activityId)
        : await completeLeadActivity(leadId, activityId)
      if (!res.success) {
        showError(res.error || "Gagal memperbarui penanda selesai aktivitas")
        return
      }
      showSuccess(
        completedAt
          ? "Penanda selesai aktivitas dibatalkan"
          : "Aktivitas ditandai selesai",
      )
      router.refresh()
    })
  }

  const label = completedAt ? "Batalkan Penanda Selesai" : "Tandai Selesai"
  const ariaLabel = subject ? `${label}: ${subject}` : label

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={isPending}
      aria-busy={isPending}
      aria-label={ariaLabel}
    >
      {completedAt ? (
        <RotateCcw size={14} aria-hidden="true" />
      ) : (
        <Check size={14} aria-hidden="true" />
      )}
      {isPending ? "Memproses..." : label}
    </Button>
  )
}
