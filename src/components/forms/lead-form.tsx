// @ts-nocheck
"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createLead, updateLead } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, Select, ListBox, Label } from "@heroui/react"

interface LeadFormProps {
  lead?: { id: number; name: string; email: string | null; phone: string | null; company: string | null; source: string | null; notes: string | null; status: string | null }
}

export function LeadForm({ lead }: LeadFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = !!lead

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        if (isEdit) {
          await updateLead(lead!.id, formData)
        } else {
          await createLead(formData)
        }
        showSuccess(isEdit ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/crm/leads")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama *</Label>
          <Input id="name" name="name" placeholder="Nama lead" required defaultValue={lead?.name || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="email@example.com" defaultValue={lead?.email || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Telepon</Label>
          <Input id="phone" name="phone" type="tel" inputMode="numeric" placeholder="08xxxxxxxxxx" defaultValue={lead?.phone || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="company">Perusahaan</Label>
          <Input id="company" name="company" placeholder="Nama perusahaan" defaultValue={lead?.company || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Select name="source" defaultSelectedKey={lead?.source || undefined} className="w-full">
            <Label>Sumber</Label>
            <Select.Trigger><Select.Value placeholder="Pilih Sumber" /><Select.Indicator /></Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="website" textValue="Website">Website<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="referral" textValue="Referral">Referral<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="social_media" textValue="Social Media">Social Media<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="cold_call" textValue="Cold Call">Cold Call<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="exhibition" textValue="Exhibition">Exhibition<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="other" textValue="Lainnya">Lainnya<ListBox.ItemIndicator /></ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="notes">Catatan</Label>
          <TextArea id="notes" name="notes" rows={3} placeholder="Catatan tentang lead..." defaultValue={lead?.notes || ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">{isPending ? "Menyimpan..." : isEdit ? "Update" : "Simpan Lead"}</button>
      </div>
    </form>
  )
}
