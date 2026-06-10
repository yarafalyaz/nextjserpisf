"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createTicket, updateTicket } from "@/actions/crm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { FormSelect } from "@/components/ui/form-select"
import { Combobox } from "@/components/ui/combobox"
import { Button } from "@/components/ui/page-header"

interface TicketFormProps {
  customers: { id: number; name: string
}[]
  ticket?: { id: number; subject: string; description?: string | null; priority: string; status: string; assignedTo?: number | null; ticketNumber?: string; customerId?: number | null; customerName?: string | null; customerEmail?: string | null; customerPhone?: string | null; type?: string | null; resolutionNotes?: string | null }
  users: { id: number; name: string }[]
}

export function TicketForm({ customers, users, ticket }: TicketFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = !!ticket?.id
  const [customerId, setCustomerId] = useState<string | null>(ticket?.customerId ? String(ticket.customerId) : null)
  const [assignedTo, setAssignedTo] = useState<string | null>(ticket?.assignedTo ? String(ticket.assignedTo) : null)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const result = ticket?.id ? await updateTicket(ticket.id, formData) : await createTicket(formData)
        if (result.success) {
          showSuccess(ticket?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
          router.push("/crm/tickets")
          router.refresh()
        } else {
          showError(result.error || "Gagal menyimpan data")
        }
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {isEdit && ticket?.ticketNumber && (
          <div className="flex flex-col gap-1.5 col-span-full">
            <Label htmlFor="ticketNumber">No. Tiket</Label>
            <Input id="ticketNumber" value={ticket.ticketNumber} readOnly className="bg-surface-secondary" />
          </div>
        )}
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="subject">Subjek *</Label>
          <Input id="subject" name="subject" placeholder="Subjek tiket" required defaultValue={ticket?.subject ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="description">Deskripsi</Label>
          <Textarea id="description" name="description" rows={4} placeholder="Deskripsi masalah..." defaultValue={ticket?.description ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customerId">Pelanggan</Label>
          <Combobox
            id="customerId"
            name="customerId"
            options={customers.map((c) => ({ value: String(c.id), label: c.name }))}
            value={customerId}
            onChange={setCustomerId}
            placeholder="Cari pelanggan..."
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customerName">Nama Pelanggan (Belum Terdaftar)</Label>
          <Input id="customerName" name="customerName" placeholder="Nama pelanggan" defaultValue={ticket?.customerName ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customerEmail">Email Pelanggan</Label>
          <Input id="customerEmail" name="customerEmail" type="email" placeholder="email@example.com" defaultValue={ticket?.customerEmail ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customerPhone">Telepon Pelanggan</Label>
          <Input id="customerPhone" name="customerPhone" type="tel" inputMode="numeric" placeholder="08xxxxxxxxxx" defaultValue={ticket?.customerPhone ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="type">Tipe</Label>
          <FormSelect
            id="type"
            name="type"
            defaultValue={ticket?.type || undefined}
            placeholder="Pilih Tipe"
            options={[
              { value: "inquiry", label: "Pertanyaan" },
              { value: "complaint", label: "Keluhan" },
              { value: "support", label: "Dukungan" },
              { value: "feedback", label: "Masukan" },
              { value: "other", label: "Lainnya" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="priority">Prioritas *</Label>
          <FormSelect
            id="priority"
            name="priority"
            defaultValue={ticket?.priority || "medium"}
            options={[
              { value: "low", label: "Rendah" },
              { value: "medium", label: "Sedang" },
              { value: "high", label: "Tinggi" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="assignedTo">Ditugaskan Ke</Label>
          <Combobox
            id="assignedTo"
            name="assignedTo"
            options={users.map((u) => ({ value: String(u.id), label: u.name }))}
            value={assignedTo}
            onChange={setAssignedTo}
            placeholder="Cari pengguna..."
          />
        </div>
        {isEdit && (
          <div className="flex flex-col gap-1.5 col-span-full">
            <Label htmlFor="resolutionNotes">Catatan Resolusi</Label>
            <Textarea id="resolutionNotes" name="resolutionNotes" rows={3} placeholder="Catatan penyelesaian tiket..." defaultValue={ticket?.resolutionNotes ?? ""} />
          </div>
        )}
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" isDisabled={isPending}  id="submit-ticket">
          {isPending ? "Menyimpan..." : ticket?.id ? "Perbarui" : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
