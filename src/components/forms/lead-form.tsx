"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createLead, updateLead } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Select, ListBox, Label, ComboBox, Input, TextArea } from "@heroui/react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Button } from "@/components/ui/page-header"

interface LeadFormProps {
  lead?: {
    id: number
    leadNumber?: string | null
    name: string
    email: string | null
    phone: string | null
    company: string | null
    contactName: string | null
    position: string | null
    industry: string | null
    estimatedValue: number | string | null
    expectedCloseDate: string | null
    address: string | null
    source: string | null
    notes: string | null
    status: string | null
    assignedTo: number | null
  }
  users?: { id: number; name: string }[]
}

export function LeadForm({ lead, users = [] }: LeadFormProps) {
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
        {isEdit && lead?.leadNumber && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="leadNumber">No. Lead</Label>
            <Input id="leadNumber" value={lead.leadNumber} readOnly className="bg-surface-secondary" />
          </div>
        )}
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
          <Label htmlFor="contactName">Nama Kontak</Label>
          <Input id="contactName" name="contactName" placeholder="Nama kontak person" defaultValue={lead?.contactName || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="position">Jabatan</Label>
          <Input id="position" name="position" placeholder="Jabatan kontak" defaultValue={lead?.position || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="industry">Industri</Label>
          <Input id="industry" name="industry" placeholder="Bidang industri" defaultValue={lead?.industry || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="estimatedValue">Estimasi Nilai</Label>
          <CurrencyInput id="estimatedValue" name="estimatedValue" placeholder="0" defaultValue={lead?.estimatedValue} prefix="Rp" />
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Estimasi Tanggal Closing"
            name="expectedCloseDate"
            defaultValue={lead?.expectedCloseDate ? lead.expectedCloseDate.substring(0, 10) : undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Select name="source" defaultSelectedKey={lead?.source || undefined} className="w-full">
            <Label>Sumber</Label>
            <Select.Trigger><Select.Value>{({ selectedText }) => selectedText || "Pilih Sumber"}</Select.Value><Select.Indicator /></Select.Trigger>
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
        {users.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <ComboBox name="assignedTo" defaultSelectedKey={lead?.assignedTo ? String(lead.assignedTo) : undefined} className="w-full">
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
        )}
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="address">Alamat</Label>
          <TextArea id="address" name="address" rows={2} placeholder="Alamat lengkap..." defaultValue={lead?.address || ""} />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="notes">Catatan</Label>
          <TextArea id="notes" name="notes" rows={3} placeholder="Catatan tentang lead..." defaultValue={lead?.notes || ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button onPress={() => router.back()} >Batal</Button>
        <Button isDisabled={isPending} >{isPending ? "Menyimpan..." : isEdit ? "Update" : "Simpan Lead"}</Button>
      </div>
    </form>
  )
}
