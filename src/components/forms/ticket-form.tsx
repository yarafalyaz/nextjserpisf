"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createTicket, updateTicket } from "@/actions/crm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Select, ComboBox, ListBox, Label, Input, TextArea } from "@heroui/react"
import { Button } from "@/components/ui/page-header"

interface TicketFormProps {
  customers: { id: number; name: string
}[]
  ticket?: { id: number; subject: string; description?: string | null; priority: string; status: string; assignedTo?: number | null; ticketNumber?: string; customerName?: string | null; customerEmail?: string | null; customerPhone?: string | null; type?: string | null; resolutionNotes?: string | null }
  users: { id: number; name: string }[]
}

export function TicketForm({ customers, users, ticket }: TicketFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = !!ticket?.id

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
        {isEdit && ticket?.ticketNumber && (
          <div className="flex flex-col gap-1.5 col-span-full">
            <Label htmlFor="ticketNumber">No. Tiket</Label>
            <Input id="ticketNumber" value={ticket.ticketNumber} readOnly className="bg-surface-secondary" />
          </div>
        )}
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
          <Label htmlFor="customerName">Nama Customer (Non-Registered)</Label>
          <Input id="customerName" name="customerName" placeholder="Nama customer" defaultValue={ticket?.customerName ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customerEmail">Email Customer</Label>
          <Input id="customerEmail" name="customerEmail" type="email" placeholder="email@example.com" defaultValue={ticket?.customerEmail ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customerPhone">Telepon Customer</Label>
          <Input id="customerPhone" name="customerPhone" type="tel" inputMode="numeric" placeholder="08xxxxxxxxxx" defaultValue={ticket?.customerPhone ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Select name="type" defaultSelectedKey={ticket?.type || undefined} className="w-full">
            <Label>Tipe</Label>
            <Select.Trigger><Select.Value>{({ selectedText }) => selectedText || "Pilih Tipe"}</Select.Value><Select.Indicator /></Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="inquiry" textValue="Inquiry">Inquiry<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="complaint" textValue="Complaint">Complaint<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="support" textValue="Support">Support<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="feedback" textValue="Feedback">Feedback<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="other" textValue="Lainnya">Lainnya<ListBox.ItemIndicator /></ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Select name="priority" defaultSelectedKey={ticket?.priority || "medium"} className="w-full">
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
        {isEdit && (
          <div className="flex flex-col gap-1.5 col-span-full">
            <Label htmlFor="resolutionNotes">Catatan Resolusi</Label>
            <TextArea id="resolutionNotes" name="resolutionNotes" rows={3} placeholder="Catatan penyelesaian tiket..." defaultValue={ticket?.resolutionNotes ?? ""} />
          </div>
        )}
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" isDisabled={isPending}  id="submit-ticket">
          {isPending ? "Menyimpan..." : ticket?.id ? "Update" : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
