"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createAsset } from "@/actions/asset.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, Select, ComboBox, ListBox, Label } from "@heroui/react"

interface AssetFormProps {
  categories: { id: number; name: string }[]
  brands: { id: number; name: string }[]
  asset?: any
}

export function AssetForm({ categories, brands, asset }: AssetFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        await createAsset(formData)
        showSuccess(asset?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/assets")
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
          <Input id="code" name="code" placeholder="Kode aset" defaultValue={asset?.code || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="categoryId">Kategori</Label>
          <select id="categoryId" name="categoryId" className="form-input" defaultValue={asset?.categoryId || ""}>
            <option value="">Pilih Kategori</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brandId">Merek</Label>
          <select id="brandId" name="brandId" className="form-input" defaultValue={asset?.brandId || ""}>
            <option value="">Pilih Merek</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="purchaseDate">Tanggal Pembelian</Label>
          <Input id="purchaseDate" name="purchaseDate" type="date" defaultValue={asset?.purchaseDate?.split("T")[0] || ""} />
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
          <Label htmlFor="status">Status</Label>
          <select id="status" name="status" className="form-input" defaultValue={asset?.status || "active"}>
            <option value="active">Active</option>
            <option value="maintenance">Maintenance</option>
            <option value="disposed">Disposed</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="description">Deskripsi</Label>
          <textarea id="description" name="description" className="form-input" rows={3} placeholder="Deskripsi aset" defaultValue={asset?.description || ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">{isPending ? "Menyimpan..." : asset?.id ? "Update" : "Simpan"}</button>
      </div>
    </form>
  )
}
