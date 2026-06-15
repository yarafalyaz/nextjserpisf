"use client"
/* eslint-disable react-hooks/incompatible-library */

import Image from "next/image"
import { useRouter } from "next/navigation"
import { useTransition, useMemo, useState, useRef } from "react"
import { useForm, Controller, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { itemSchema, type ItemInput } from "@/lib/validators"
import { createItem, updateItem } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Switch } from "@/components/ui/shadcn/switch"
import { FormSelect } from "@/components/ui/form-select"
import { Combobox } from "@/components/ui/combobox"
import { Upload, X, AlertCircle } from "lucide-react"
import { CurrencyInput } from "@/components/ui/currency-input"
import { QrCodeDisplay } from "@/components/ui/qr-code-display"
import { formatCurrency } from "@/lib/utils/format"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/shadcn/alert"
import { Button } from "@/components/ui/button"

interface ItemFormProps {
  item?: {
    id: number
    sku: string
    name: string
    description: string | null
    image: string | null
    categoryId: number | null
    brandId: number | null
    vendorId: number | null
    defaultWarehouseId: number | null
    defaultRackId: number | null
    defaultRackRowId: number | null
    unitOfMeasure: string
    minStock: number
    cost: number
    price: number
    standardCost: number | null
    costingMethod: string | null
    purchasePrice: number | null
    isProduct: boolean
    trackBatch?: boolean
    trackSerial?: boolean
    uomConversions?: { code: string; factorToBase: number | string }[]
  }
  categories: { id: number; name: string }[]
  brands: { id: number; name: string }[]
  vendors: { id: number; name: string }[]
  warehouses: { id: number; name: string }[]
  racks: { id: number; name: string; warehouseId: number }[]
  rackRows: { id: number; name: string; rackId: number }[]
  generatedCode?: string
  enableAutoCode?: boolean
  baseUrl?: string
}

export function ItemForm({ item, categories, brands, vendors, warehouses, racks, rackRows, generatedCode, enableAutoCode = true, baseUrl = "" }: ItemFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(item?.image || null)
  const [isProduct, setIsProduct] = useState(item?.isProduct ?? false)
  const [trackBatch, setTrackBatch] = useState(item?.trackBatch ?? false)
  const [trackSerial, setTrackSerial] = useState(item?.trackSerial ?? false)
  const [uomConversions, setUomConversions] = useState<{ code: string; factorToBase: string }[]>(
    item?.uomConversions?.map((u) => ({ code: u.code, factorToBase: String(u.factorToBase) })) ?? []
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isEdit = !!item

  function addUom() {
    setUomConversions([...uomConversions, { code: "", factorToBase: "" }])
  }

  function removeUom(index: number) {
    setUomConversions(uomConversions.filter((_, i) => i !== index))
  }

  function updateUom(index: number, field: "code" | "factorToBase", value: string) {
    const updated = [...uomConversions]
    updated[index] = { ...updated[index], [field]: value }
    setUomConversions(updated)
  }

  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm<ItemInput>({
    resolver: zodResolver(itemSchema) as Resolver<ItemInput>,
    defaultValues: {
      sku: item?.sku || (enableAutoCode ? generatedCode : "") || "",
      name: item?.name || "",
      description: item?.description || "",
      image: item?.image || "",
      categoryId: item?.categoryId || undefined,
      brandId: item?.brandId || undefined,
      vendorId: item?.vendorId || undefined,
      defaultWarehouseId: item?.defaultWarehouseId || undefined,
      defaultRackId: item?.defaultRackId || undefined,
      defaultRackRowId: item?.defaultRackRowId || undefined,
      unitOfMeasure: item?.unitOfMeasure || "PCS",
      minStock: item?.minStock || 0,
      cost: item?.cost || 0,
      price: item?.price || 0,
      standardCost: item?.standardCost || 0,
      costingMethod: item?.costingMethod || undefined,
      purchasePrice: item?.purchasePrice || 0}})

  const selectedWarehouseId = watch("defaultWarehouseId")
  const selectedRackId = watch("defaultRackId")

  const watchedCost = Number(watch("cost")) || 0
  const watchedPrice = Number(watch("price")) || 0
  const priceBelowCost = watchedPrice < watchedCost
  const profit = watchedPrice - watchedCost
  const marginPct = watchedCost > 0 ? (profit / watchedCost) * 100 : 0
  const formatPct = (n: number) => {
    const r = Math.round(n * 10) / 10
    return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(".", ",")
  }

  const filteredRacks = useMemo(() => {
    if (!selectedWarehouseId) return []
    return racks.filter((r) => r.warehouseId === selectedWarehouseId)
  }, [racks, selectedWarehouseId])

  const filteredRackRows = useMemo(() => {
    if (!selectedRackId) return []
    return rackRows.filter((r) => r.rackId === selectedRackId)
  }, [rackRows, selectedRackId])

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    if (!allowedTypes.includes(file.type)) {
      showError("Format file tidak didukung. Gunakan JPG, PNG, WebP, atau GIF.")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      showError("Ukuran file maksimal 5MB")
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("image", file)

      const res = await fetch("/api/upload/items", { method: "POST", body: formData })
      const data = await res.json()

      if (res.ok) {
        setValue("image", data.url)
        setImagePreview(data.url)
      } else {
        showError(data.error || "Unggah gagal")
      }
    } catch (err) {
      showError("Unggah gagal: " + (err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  function handleRemoveImage() {
    setValue("image", "")
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function onSubmit(data: ItemInput) {
    startTransition(async () => {
      try {
        const formData = new FormData()
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined && value !== null) formData.append(key, String(value))
        })
        formData.set("isProduct", String(isProduct))
        formData.set("trackBatch", String(trackBatch))
        formData.set("trackSerial", String(trackSerial))
        const cleanedUom = uomConversions
          .filter((u) => u.code.trim() !== "" && u.factorToBase !== "")
          .map((u) => ({ code: u.code.trim(), factorToBase: Number(u.factorToBase) }))
        formData.set("uomConversions", JSON.stringify(cleanedUom))
        const result = isEdit ? await updateItem(item!.id, formData) : await createItem(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        showSuccess(isEdit ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/master/barang")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormCard>
        <FormSection title="Informasi Umum">
          <div className="flex flex-col gap-1.5 col-span-full">
            <Label htmlFor="name">Nama Item *</Label>
            <Input id="name" {...register("name")} placeholder="Nama item" />
            {errors.name && <span className="text-xs text-danger mt-1">{errors.name.message}</span>}
          </div>
          <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
            <div className="flex flex-col gap-1.5">
            <Label>Gambar Item</Label>
            <input type="hidden" {...register("image")} />
            <div className="image-upload-area">
              {imagePreview ? (
                <div className="image-upload-preview">
                  <Image
                    src={imagePreview}
                    alt="Pratinjau"
                    width={240}
                    height={240}
                    className="image-upload-img"
                    unoptimized
                  />
                  <Button type="button" onPress={handleRemoveImage} className="image-upload-remove" aria-label="Hapus gambar">
                    <X className="size-4" />
                  </Button>
                </div>
              ) : (
                <div
                  className="image-upload-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-8 text-muted-foreground" />
                  <span className="text-sm text-secondary">Klik untuk unggah gambar</span>
                  <span className="text-xs text-muted-foreground">JPG, PNG, WebP, GIF (maks 5MB)</span>
                </div>
              )}
              {uploading && <div className="image-upload-loading">Mengunggah...</div>}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleImageUpload}
              className="hidden"
            />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qr">QR Code</Label>
              {watch("sku")
                ? <QrCodeDisplay value={`${baseUrl}/inventaris/scan?code=${encodeURIComponent(watch("sku") || "")}`} />
                : <span className="text-xs text-muted-foreground">QR Code dibuat dari SKU barang.</span>}
              <span className="text-xs text-muted-foreground">Scan untuk buka data barang (sesuai hak akses).</span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sku">SKU</Label>
            <Input id="sku" {...register("sku")} readOnly={isEdit || enableAutoCode} className={isEdit || enableAutoCode ? "bg-muted" : undefined} placeholder={enableAutoCode ? "Dibuat otomatis" : "Masukkan SKU manual"} />
            {errors.sku && <span className="text-xs text-danger mt-1">{errors.sku.message}</span>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Controller
              name="brandId"
              control={control}
              render={({ field }) => (
                <>
                  <Label htmlFor="brandId">Merek</Label>
                  <Combobox
                    id="brandId"
                    options={brands.map((b) => ({ value: String(b.id), label: b.name }))}
                    value={field.value ? String(field.value) : null}
                    onChange={(key) => field.onChange(key ? Number(key) : undefined)}
                    placeholder="Cari merek..."
                  />
                </>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Controller
              name="categoryId"
              control={control}
              render={({ field }) => (
                <>
                  <Label htmlFor="categoryId">Kategori *</Label>
                  <Combobox
                    id="categoryId"
                    options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                    value={field.value ? String(field.value) : null}
                    onChange={(key) => field.onChange(key ? Number(key) : undefined)}
                    placeholder="Cari kategori..."
                  />
                </>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Controller
              name="vendorId"
              control={control}
              render={({ field }) => (
                <>
                  <Label htmlFor="vendorId">Pemasok</Label>
                  <Combobox
                    id="vendorId"
                    options={vendors.map((v) => ({ value: String(v.id), label: v.name }))}
                    value={field.value ? String(field.value) : null}
                    onChange={(key) => field.onChange(key ? Number(key) : undefined)}
                    placeholder="Cari pemasok..."
                  />
                </>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Controller
              name="unitOfMeasure"
              control={control}
              render={({ field }) => (
                <>
                  <Label htmlFor="unitOfMeasure">Satuan</Label>
                  <FormSelect
                    id="unitOfMeasure"
                    value={field.value || "PCS"}
                    onValueChange={field.onChange}
                    options={[
                      { value: "PCS", label: "PCS" },
                      { value: "SET", label: "SET" },
                      { value: "KG", label: "KG" },
                      { value: "LTR", label: "LTR" },
                      { value: "MTR", label: "MTR" },
                      { value: "BOX", label: "BOX" },
                    ]}
                  />
                </>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="minStock">Minimum Stok</Label>
            <Input id="minStock" type="number" min="0" {...register("minStock", { valueAsNumber: true })} placeholder="0" />
          </div>
        </FormSection>

        <FormSection title="Keuangan">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cost">Harga Beli (Rp)</Label>
            <Controller name="cost" control={control} render={({ field: f }) => <CurrencyInput id="cost" value={f.value} onChange={f.onChange} onBlur={f.onBlur} placeholder="0" prefix="Rp" />} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="price">Harga Jual (Rp)</Label>
            <Controller name="price" control={control} render={({ field: f }) => <CurrencyInput id="price" value={f.value} onChange={f.onChange} onBlur={f.onBlur} placeholder="0" prefix="Rp" />} />
            {!priceBelowCost && watchedPrice > 0 && (
              <span className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">
                Untung {formatCurrency(profit)}{watchedCost > 0 ? ` (${formatPct(marginPct)}% dari modal)` : ""}
              </span>
            )}
            {errors.price && <span className="text-xs text-danger mt-1">{errors.price.message}</span>}
          </div>
          {priceBelowCost && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertCircle />
              <AlertTitle>Harga jual di bawah modal</AlertTitle>
              <AlertDescription>
                Harga jual ({formatCurrency(watchedPrice)}) lebih rendah dari harga beli ({formatCurrency(watchedCost)}). Item tidak dapat disimpan. Diskon diterapkan saat penawaran/penjualan, bukan di master.
              </AlertDescription>
            </Alert>
          )}
        </FormSection>

        <FormSection title="Lokasi Penyimpanan">
          <div className="flex flex-col gap-1.5">
            <Controller
              name="defaultWarehouseId"
              control={control}
              render={({ field }) => (
                <>
                  <Label htmlFor="defaultWarehouseId">Gudang Bawaan</Label>
                  <Combobox
                    id="defaultWarehouseId"
                    options={warehouses.map((w) => ({ value: String(w.id), label: w.name }))}
                    value={field.value ? String(field.value) : null}
                    onChange={(key) => {
                      field.onChange(key ? Number(key) : undefined)
                      setValue("defaultRackId", undefined)
                      setValue("defaultRackRowId", undefined)
                    }}
                    placeholder="Cari gudang..."
                  />
                </>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Controller
              name="defaultRackId"
              control={control}
              render={({ field }) => (
                <>
                  <Label htmlFor="defaultRackId">Rak</Label>
                  <Combobox
                    id="defaultRackId"
                    options={filteredRacks.map((r) => ({ value: String(r.id), label: r.name }))}
                    value={field.value ? String(field.value) : null}
                    onChange={(key) => {
                      field.onChange(key ? Number(key) : undefined)
                      setValue("defaultRackRowId", undefined)
                    }}
                    disabled={!selectedWarehouseId}
                    placeholder="Cari rak..."
                  />
                </>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Controller
              name="defaultRackRowId"
              control={control}
              render={({ field }) => (
                <>
                  <Label htmlFor="defaultRackRowId">Baris</Label>
                  <Combobox
                    id="defaultRackRowId"
                    options={filteredRackRows.map((r) => ({ value: String(r.id), label: r.name }))}
                    value={field.value ? String(field.value) : null}
                    onChange={(key) => field.onChange(key ? Number(key) : undefined)}
                    disabled={!selectedRackId}
                    placeholder="Cari baris..."
                  />
                </>
              )}
            />
          </div>
        </FormSection>

        <FormSection title="Lainnya" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Deskripsi</Label>
            <Textarea id="description" {...register("description")} rows={2} placeholder="Deskripsi item" />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <Switch
                checked={isProduct}
                onCheckedChange={setIsProduct}
                id="isProduct"
              />
              <Label htmlFor="isProduct">Tandai sebagai Produk</Label>
            </div>
            <span className="text-xs text-muted-foreground">Aktifkan jika item ini merupakan produk jadi</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <Switch
                checked={trackBatch}
                onCheckedChange={setTrackBatch}
                id="trackBatch"
              />
              <Label htmlFor="trackBatch">Lacak Batch/Lot</Label>
            </div>
            <span className="text-xs text-muted-foreground">Aktifkan untuk melacak nomor batch/lot dan tanggal kedaluwarsa</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <Switch
                checked={trackSerial}
                onCheckedChange={setTrackSerial}
                id="trackSerial"
              />
              <Label htmlFor="trackSerial">Lacak Nomor Seri</Label>
            </div>
            <span className="text-xs text-muted-foreground">Aktifkan untuk melacak nomor seri tiap unit</span>
          </div>
        </FormSection>

        <FormSection title="Satuan Alternatif (Multi-UoM)" columns={1}>
          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs text-muted-foreground">Satuan dasar: <strong>{watch("unitOfMeasure") || "PCS"}</strong>. Tentukan satuan alternatif beserta faktor konversi ke satuan dasar.</span>
              <Button type="button" onPress={addUom} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-all">+ Tambah Satuan</Button>
            </div>
            {uomConversions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Belum ada satuan alternatif.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-default">
                      <th className="text-left py-2 px-2 font-medium text-secondary">Kode Satuan</th>
                      <th className="text-left py-2 px-2 font-medium text-secondary" style={{ width: "220px" }}>Faktor ke Satuan Dasar</th>
                      <th style={{ width: "40px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {uomConversions.map((u, i) => (
                      <tr key={i} className="border-b border-default/50">
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={u.code}
                            onChange={(e) => updateUom(i, "code", e.target.value)}
                            className="form-input"
                            style={{ fontSize: "0.8125rem", padding: "6px" }}
                            placeholder="cth. BOX"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="any"
                              min="0.001"
                              value={u.factorToBase}
                              onChange={(e) => updateUom(i, "factorToBase", e.target.value)}
                              className="form-input"
                              style={{ fontSize: "0.8125rem", padding: "6px", width: "120px" }}
                              placeholder="cth. 12"
                            />
                            <span className="text-xs text-muted-foreground whitespace-nowrap">{watch("unitOfMeasure") || "PCS"}</span>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-center">
                          <Button type="button" onPress={() => removeUom(i)} className="p-1.5 rounded-md text-danger hover:bg-danger/10 transition-all">×</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </FormSection>

        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending || uploading}>
            {isPending ? "Menyimpan..." : isEdit ? "Perbarui" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
