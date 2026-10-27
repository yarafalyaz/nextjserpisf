"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createAsset, updateAsset } from "@/actions/asset.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Label } from "@/components/ui/shadcn/label"
import { FormSelect } from "@/components/ui/form-select"
import { AppDatePicker } from "@/components/ui/date-picker"
import { CurrencyInput } from "@/components/ui/currency-input"

import { Button } from "@/components/ui/button"

interface AssetFormProps {
  categories: { id: number; name: string }[]
  brands: { id: number; name: string; models: { id: number; name: string }[] }[]
  groups?: { id: number; name: string }[]
  asset?: {
    id?: number
    name?: string | null
    code?: string | null
    categoryId?: number | null
    assetBrandId?: number | null
    assetBrandModelId?: number | null
    groupId?: number | null
    purchaseDate?: string | null
    purchasePrice?: number | null
    residualValue?: number | null
    depreciationMethod?: string | null
    totalEstimatedUnits?: number | null
    productionUnitName?: string | null
    usefulLifeMonths?: number | null
    location?: string | null
    status?: string | null
    description?: string | null
  }
  generatedCode: string
}

export function AssetForm({ categories, brands, groups = [], asset, generatedCode }: AssetFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // Merek terpilih mengendalikan opsi Tipe/Model: hanya model milik merek itu
  // yang ditawarkan, dan ganti merek mengosongkan pilihan model yang basi
  // (kalau tidak, ID model merek lama terkirim bersama merek baru).
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(
    asset?.assetBrandId ? String(asset.assetBrandId) : null,
  )
  const [selectedModelId, setSelectedModelId] = useState<string | null>(
    asset?.assetBrandModelId ? String(asset.assetBrandModelId) : null,
  )
  const [selectedMethod, setSelectedMethod] = useState<string | null>(asset?.depreciationMethod || "straight_line")
  const modelOptions =
    brands.find((b) => String(b.id) === selectedBrandId)?.models.map((m) => ({
      value: String(m.id),
      label: m.name,
    })) ?? []

  function handleBrandChange(v: string | null) {
    setSelectedBrandId(v)
    // Model milik merek lama tidak berlaku untuk merek baru — kosongkan supaya
    // ID basi tidak terkirim bersama merek yang baru dipilih.
    setSelectedModelId(null)
  }

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
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
    <form onSubmit={onSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
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
          <Label htmlFor="assetBrandId">Merek</Label>
          <FormSelect
            id="assetBrandId"
            name="assetBrandId"
            value={selectedBrandId}
            onValueChange={handleBrandChange}
            placeholder="Pilih Merek"
            options={brands.map(b => ({ value: String(b.id), label: b.name }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="assetBrandModelId">Tipe / Model</Label>
          <FormSelect
            id="assetBrandModelId"
            name="assetBrandModelId"
            value={selectedModelId}
            onValueChange={setSelectedModelId}
            placeholder={selectedBrandId ? (modelOptions.length > 0 ? "Pilih Tipe / Model" : "Merek ini belum punya tipe") : "Pilih merek dulu"}
            options={modelOptions}
            disabled={!selectedBrandId || modelOptions.length === 0}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="groupId">Grup Aset</Label>
          <FormSelect
            id="groupId"
            name="groupId"
            defaultValue={asset?.groupId ? String(asset.groupId) : undefined}
            placeholder="Pilih Grup"
            options={groups.map(g => ({ value: String(g.id), label: g.name }))}
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
            value={selectedMethod}
            onValueChange={setSelectedMethod}
            placeholder="Garis Lurus"
            options={[
              { value: "straight_line", label: "Garis Lurus" },
              { value: "declining_balance", label: "Saldo Menurun" },
              { value: "units_of_production", label: "Unit Produksi (analitis, tanpa jurnal)" },
              { value: "sum_of_years_digits", label: "Jumlah Angka Tahun (analitis, tanpa jurnal)" },
            ]}
          />
        </div>
        {selectedMethod === "units_of_production" && (<>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="totalEstimatedUnits">Total Estimasi Unit (terbekukan)</Label>
            <Input id="totalEstimatedUnits" name="totalEstimatedUnits" type="number" step="any" min={0} placeholder="0" defaultValue={asset?.totalEstimatedUnits ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="productionUnitName">Satuan Produksi</Label>
            <Input id="productionUnitName" name="productionUnitName" placeholder="cth. unit, km, jam" defaultValue={asset?.productionUnitName || ""} />
          </div>
        </>)}
        {selectedMethod === "sum_of_years_digits" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="usefulLifeMonths">Masa Manfaat (bulan, terbekukan)</Label>
            <Input id="usefulLifeMonths" name="usefulLifeMonths" type="number" step={1} min={1} placeholder="cth. 60" defaultValue={asset?.usefulLifeMonths ?? ""} />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="location">Lokasi</Label>
          <Input id="location" name="location" placeholder="Lokasi aset" defaultValue={asset?.location || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status">Status Guna</Label>
          {/* Hanya status terdaftar F-2026-10-23-117-V. held_for_sale tidak
              ditawarkan di sini: klasifikasinya butuh 5 fakta terstruktur +
              peristiwa status (inti BOT 3 ditunda); disposed hanya lewat
              aksi Pelepasan. Status lama tak terdaftar tetap tampil apa
              adanya supaya user melihat temuan, bukan label sah palsu. */}
          <FormSelect
            id="status"
            name="status"
            defaultValue={asset?.status || "active"}
            placeholder="Aktif"
            options={[
              { value: "active", label: "Aktif" },
              ...(asset?.status && !["active", "disposed"].includes(asset.status)
                ? [{ value: asset.status, label: `Status tidak terdaftar: ${asset.status}` }]
                : []),
              ...(asset?.status === "disposed"
                ? [{ value: "disposed", label: "Dilepas" }]
                : []),
            ]}
          />
          <p className="text-xs text-muted-foreground">
            Menganggur sementara tetap Aktif. Dimiliki untuk Dijual diatur
            lewat klasifikasi khusus; Dilepas lewat aksi Pelepasan Aset.
          </p>
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="description">Deskripsi</Label>
          <Textarea id="description" name="description" rows={3} placeholder="Deskripsi aset" defaultValue={asset?.description || ""} />
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 mt-6 pt-5 border-t border-default">
        <Button className="w-full sm:w-auto" type="button" onPress={() => router.back()} >Batal</Button>
        <Button className="w-full sm:w-auto" type="submit" variant="primary" isDisabled={isPending}>{isPending ? "Menyimpan..." : asset?.id ? "Perbarui" : "Simpan"}</Button>
      </div>
    </form>
  )
}
