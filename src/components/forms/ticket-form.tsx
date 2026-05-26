// @ts-nocheck
"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createTicket, updateTicket } from "@/actions/crm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, Select, ComboBox, ListBox, Label } from "@heroui/react"

interface TicketFormProps {
  customers: { id: number; name: string
}[]
  ticket?: any
  users: { id: number; name: string }[]
}

export function TicketForm({ customers, users, ticket }: TicketFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const result = ticket?.id ? await updateTicket(ticket.id, formData) : await createTicket(formData)
        if (result.success) {
          showSuccess(ticket?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
          router.push("/crm/tickets")
          router.refresh()
        }
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="subject">Subject *</Label>
          <Input id="subject" name="subject" placeholder="Subject ticket" required defaultValue={ticket?.subject ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="description">Deskripsi</Label>
          <TextArea id="description" name="description" rows={4} placeholder="Deskripsi masalah..." defaultValue={ticket?.description ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <ComboBox name="customerId" className="w-full">
            <Label>Customer</Label>
            <ComboBox.InputGroup><Input placeholder="Cari customer..." /><ComboBox.Trigger /></ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {customers.map((c) => (
                  <ListBox.Item key={c.id} id={String(c.id)} textValue={c.name}>{c.name}</ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>
        <div className="flex flex-col gap-1.5">
          <Select name="priority" defaultSelectedKey="medium" className="w-full">
            <Label>Prioritas *</Label>
            <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="low" textValue="Low">Low<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="medium" textValue="Medium">Medium<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="high" textValue="High">High<ListBox.ItemIndicator /></ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <ComboBox name="assignedTo" className="w-full">
            <Label>Ditugaskan Ke</Label>
            <ComboBox.InputGroup><Input placeholder="Cari user..." /><ComboBox.Trigger /></ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {users.map((u) => (
                  <ListBox.Item key={u.id} id={String(u.id)} textValue={u.name}>{u.name}</ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="submit-ticket">
          {isPending ? "Menyimpan..." : ticket?.id ? "Update" : "Simpan"}
        </button>
      </div>
    </form>
  )
}
