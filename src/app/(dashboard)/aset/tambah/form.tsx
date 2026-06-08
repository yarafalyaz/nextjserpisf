"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createAsset, updateAsset } from "@/actions/asset.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Label } from "@/components/ui/shadcn/label"
import { FormSelect } from "@/components/ui/form-select"
import { AppDatePicker } from "@/components/ui/date-picker"
import { CurrencyInput } from "@/components/ui/currency-input"

import { Button } from "@/components/ui/page-header"

interface AssetFormProps {
  categories: { id: number; name: string }[]
  brands: { id: number; name: string }[]
  asset?: {
    id?: number
    name?: string | null
    code?: string | null
    categoryId?: number | null
    brandId?: number | null
    purchaseDate?: string | null
    purchasePrice?: number | string | null
    residualValue?: number | string | null
    depreciationMethod?: string | null
    location?: string | null
    status?: string | null
    description?: string | null
  }
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
        const result = asset?.id ? await updateAsset(asset.id, formData) : await createAsset(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        showSuccess(asset?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
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
          <Label htmlFor="categoryId">Kategori</Label>
          <FormSelect
            id="categoryId"
            name="categoryId"
            defaultValue={asset?.categoryId ? String(asset.categoryId) : undefined}
            placeholder="Pilih Kategori"
            options={categories.map(c => ({ value: String(c.id), label: c.name }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brandId">Merek</Label>
          <FormSelect
            id="brandId"
            name="brandId"
            defaultValue={asset?.brandId ? String(asset.brandId) : undefined}
            placeholder="Pilih Merek"
            options={brands.map(b => ({ value: String(b.id), label: b.name }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker label="Tanggal Pembelian" name="purchaseDate" defaultValue={asset?.purchaseDate?.split("T")[0] || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="purchasePrice">Harga Pembelian</Label>
          <CurrencyInput id="purchasePrice" name="purchasePrice" placeholder="0" prefix="Rp" defaultValue={asset?.purchasePrice ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="residualValue">Nilai Residu</Label>
          <CurrencyInput id="residualValue" name="residualValue" placeholder="0" prefix="Rp" defaultValue={asset?.residualValue ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="depreciationMethod">Metode Penyusutan</Label>
          <FormSelect
            id="depreciationMethod"
            name="depreciationMethod"
            defaultValue={asset?.depreciationMethod || "straight_line"}
            placeholder="Garis Lurus"
            options={[
              { value: "straight_line", label: "Garis Lurus" },
              { value: "declining_balance", label: "Saldo Menurun" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="location">Lokasi</Label>
          <Input id="location" name="location" placeholder="Lokasi aset" defaultValue={asset?.location || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status">Status</Label>
          <FormSelect
            id="status"
            name="status"
            defaultValue={asset?.status || "active"}
            placeholder="Aktif"
            options={[
              { value: "active", label: "Aktif" },
              { value: "maintenance", label: "Pemeliharaan" },
              { value: "disposed", label: "Dilepas" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="description">Deskripsi</Label>
          <Textarea id="description" name="description" rows={3} placeholder="Deskripsi aset" defaultValue={asset?.description || ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending}>{isPending ? "Menyimpan..." : asset?.id ? "Perbarui" : "Simpan"}</Button>
      </div>
    </form>
  )
}
