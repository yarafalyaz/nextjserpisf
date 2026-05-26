// @ts-nocheck
"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { FormAttachmentUpload } from "@/components/ui/form-attachment-upload"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, Select, ComboBox, ListBox, Label } from "@heroui/react"

export function PettyCashForm({ accounts, pettyCash }: { accounts: { id: number; code: string; name: string; type: string }[]; pettyCash?: any }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])

  const assetAccounts = accounts.filter((a) => a.type === "ASSET")
  const expenseAccounts = accounts.filter((a) => a.type === "EXPENSE")
  const allAccounts = [...assetAccounts.map((a) => ({ ...a, group: "Kas/Bank" })), ...expenseAccounts.map((a) => ({ ...a, group: "Beban" }))]

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const { createPettyCash } = await import("@/actions/finance.actions")
        pettyCash?.id ? await updatePettyCash(pettyCash.id, formData) : await createPettyCash(formData)
        showSuccess(pettyCash?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/finance/petty-cash")
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
          <Select name="type" defaultSelectedKey="IN" className="w-full" isRequired>
            <Label>Tipe *</Label>
            <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="IN" textValue="Masuk (Pengisian)">Masuk (Pengisian)<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="OUT" textValue="Keluar (Pengeluaran)">Keluar (Pengeluaran)<ListBox.ItemIndicator /></ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Jumlah (Rp) *</Label>
          <Input id="amount" name="amount" type="number" step="0.01" placeholder="0" required defaultValue={pettyCash?.amount ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Tanggal"
            name="date"
            value={date}
            onChange={(val) => setDate(val)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <ComboBox name="accountId" className="w-full">
            <Label>Akun Sumber (IN) / Beban (OUT)</Label>
            <ComboBox.InputGroup><Input placeholder="Cari akun..." /><ComboBox.Trigger /></ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {allAccounts.map((a) => (
                  <ListBox.Item key={a.id} id={String(a.id)} textValue={`${a.code} - ${a.name}`}>{a.group}: {a.code} - {a.name}</ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="description">Deskripsi</Label>
          <TextArea id="description" name="description" rows={3} placeholder="Deskripsi transaksi kas kecil..." defaultValue={pettyCash?.description ?? ""} />
        </div>
      </div>
      <FormAttachmentUpload referenceType="petty_cash" />
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">{isPending ? "Menyimpan..." : pettyCash?.id ? "Update" : "Simpan"}</button>
      </div>
    </form>
  )
}
