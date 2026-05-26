// @ts-nocheck
"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, ComboBox, ListBox, Label } from "@heroui/react"

interface AssetTransferFormProps {
  assets: { id: number; code: string; name: string; location: string | null
}[]
  transfer?: any
}

export function AssetTransferForm({ assets, transfer }: AssetTransferFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0])
  const [assetId, setAssetId] = useState("")

  const selectedAsset = assets.find((a) => a.id === Number(assetId))

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const { createAssetTransfer } = await import("@/actions/asset.actions")
        transfer?.id ? await updateAssetTransfer(transfer.id, formData) : await createAssetTransfer(formData)
        showSuccess(transfer?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/assets/transfers")
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
          <ComboBox name="assetId" selectedKey={assetId || null} onSelectionChange={(key) => setAssetId(key ? String(key) : "")} className="w-full" isRequired>
            <Label>Aset *</Label>
            <ComboBox.InputGroup><Input placeholder="Cari aset..." /><ComboBox.Trigger /></ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {assets.map((a) => (
                  <ListBox.Item key={a.id} id={String(a.id)} textValue={`${a.code} - ${a.name}`}>{a.code} - {a.name}</ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fromLocation">Dari Lokasi</Label>
          <Input id="fromLocation" name="fromLocation" defaultValue={selectedAsset?.location || ""} placeholder="Lokasi asal" readOnly={!!selectedAsset?.location} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="toLocation">Ke Lokasi *</Label>
          <Input id="toLocation" name="toLocation" placeholder="Lokasi tujuan" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker label="Tanggal Transfer *" name="transferDate" value={transferDate} onChange={setTransferDate} required />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="notes">Catatan</Label>
          <TextArea id="notes" name="notes" rows={3} placeholder="Catatan transfer..." />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">{isPending ? "Menyimpan..." : transfer?.id ? "Update" : "Simpan"}</button>
      </div>
    </form>
  )
}
