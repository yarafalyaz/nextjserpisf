"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createAsset } from "@/actions/asset.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, Select, ListBox, Label } from "@heroui/react"
import { AppDatePicker } from "@/components/ui/date-picker"

import { Button } from "@/components/ui/page-header"

interface AssetFormProps {
  categories: { id: number; name: string }[]
  brands: { id: number; name: string }[]
  asset?: any
  generatedCode: string
}

export function AssetForm({ categories, brands, asset, generatedCode }: AssetFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        await createAsset(formData)
        showSuccess(asset?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/aset")
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
          <Label htmlFor="name">Nama Aset *</Label>
          <Input id="name" name="name" required placeholder="Nama aset" defaultValue={asset?.name || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Kode Aset</Label>
          <Input id="code" name="code" value={asset?.code || generatedCode} readOnly className="bg-default-soft font-mono" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Select name="categoryId" defaultSelectedKey={asset?.categoryId ? String(asset.categoryId) : undefined} className="w-full">
            <Label htmlFor="categoryId">Kategori</Label>
            <Select.Trigger><Select.Value>{({ selectedText }) => selectedText || "Pilih Kategori"}</Select.Value><Select.Indicator /></Select.Trigger>
            <Select.Popover>
              <ListBox>
                {categories.map(c => <ListBox.Item key={String(c.id)} id={String(c.id)} textValue={c.name}>{c.name}<ListBox.ItemIndicator /></ListBox.Item>)}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Select name="brandId" defaultSelectedKey={asset?.brandId ? String(asset.brandId) : undefined} className="w-full">
            <Label htmlFor="brandId">Merek</Label>
            <Select.Trigger><Select.Value>{({ selectedText }) => selectedText || "Pilih Merek"}</Select.Value><Select.Indicator /></Select.Trigger>
            <Select.Popover>
              <ListBox>
                {brands.map(b => <ListBox.Item key={String(b.id)} id={String(b.id)} textValue={b.name}>{b.name}<ListBox.ItemIndicator /></ListBox.Item>)}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker label="Tanggal Pembelian" name="purchaseDate" defaultValue={asset?.purchaseDate?.split("T")[0] || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="purchasePrice">Harga Pembelian</Label>
          <Input id="purchasePrice" name="purchasePrice" type="number" placeholder="0" defaultValue={asset?.purchasePrice || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="location">Lokasi</Label>
          <Input id="location" name="location" placeholder="Lokasi aset" defaultValue={asset?.location || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Select name="status" defaultSelectedKey={asset?.status || "active"} className="w-full">
            <Label htmlFor="status">Status</Label>
            <Select.Trigger><Select.Value>{({ selectedText }) => selectedText || "Active"}</Select.Value><Select.Indicator /></Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item key="active" id="active" textValue="Active">Active<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item key="maintenance" id="maintenance" textValue="Maintenance">Maintenance<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item key="disposed" id="disposed" textValue="Disposed">Disposed<ListBox.ItemIndicator /></ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="description">Deskripsi</Label>
          <TextArea id="description" name="description" rows={3} placeholder="Deskripsi aset" defaultValue={asset?.description || ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending}>{isPending ? "Menyimpan..." : asset?.id ? "Update" : "Simpan"}</Button>
      </div>
    </form>
  )
}
