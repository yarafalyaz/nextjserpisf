"use client"

import { useRouter } from "next/navigation"
import { useTransition, useMemo, useState, useRef } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { itemSchema, type ItemInput } from "@/lib/validators"
import { createItem, updateItem } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import {Label, Select, ComboBox, ListBox, InputGroup , Select as HeroSelect, Switch} from "@heroui/react"
import { Upload, X } from "lucide-react"
import { SelectValue, SelectLabel, Input, TextArea } from "@/components/ui/heroui-compat"
import { CurrencyInput } from "@/components/ui/currency-input"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/page-header"

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
  }
  categories: { id: number; name: string }[]
  brands: { id: number; name: string }[]
  vendors: { id: number; name: string }[]
  warehouses: { id: number; name: string }[]
  racks: { id: number; name: string; warehouseId: number }[]
  rackRows: { id: number; name: string; rackId: number }[]
  generatedCode?: string
}

export function ItemForm({ item, categories, brands, vendors, warehouses, racks, rackRows, generatedCode }: ItemFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(item?.image || null)
  const [isProduct, setIsProduct] = useState(item?.isProduct ?? false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isEdit = !!item

  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm<ItemInput>({
    resolver: zodResolver(itemSchema) as any,
    defaultValues: {
      sku: item?.sku || generatedCode || "",
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
        showError(data.error || "Upload gagal")
      }
    } catch (err) {
      showError("Upload gagal: " + (err as Error).message)
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
        if (isEdit) {
          await updateItem(item!.id, formData)
        } else {
          await createItem(formData)
        }
        showSuccess(isEdit ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/master/items")
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
          <div className="flex flex-col gap-1.5 col-span-full">
            <Label>Gambar Item</Label>
            <input type="hidden" {...register("image")} />
            <div className="image-upload-area">
              {imagePreview ? (
                <div className="image-upload-preview">
                  <img src={imagePreview} alt="Preview" className="image-upload-img" />
                  <button type="button" onClick={handleRemoveImage} className="image-upload-remove" aria-label="Hapus gambar">
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <div
                  className="image-upload-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-8 text-muted" />
                  <span className="text-sm text-secondary">Klik untuk upload gambar</span>
                  <span className="text-xs text-muted">JPG, PNG, WebP, GIF (maks 5MB)</span>
                </div>
              )}
              {uploading && <div className="image-upload-loading">Mengupload...</div>}
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
            <Label htmlFor="sku">SKU</Label>
            <Input id="sku" {...register("sku")} readOnly className="bg-muted" />
            {errors.sku && <span className="text-xs text-danger mt-1">{errors.sku.message}</span>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Controller
              name="brandId"
              control={control}
              render={({ field }) => (
                <ComboBox
                  selectedKey={field.value ? String(field.value) : null}
                  onSelectionChange={(key) => field.onChange(key ? Number(key) : undefined)}
                  className="w-full"
                >
                  <Label>Brand</Label>
                  <ComboBox.InputGroup>
                    <Input placeholder="Cari brand..." />
                    <ComboBox.Trigger />
                  </ComboBox.InputGroup>
                  <ComboBox.Popover>
                    <ListBox>
                      {brands.map((b) => (
                        <ListBox.Item key={b.id} id={String(b.id)} textValue={b.name}>
                          {b.name}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </ComboBox.Popover>
                </ComboBox>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Controller
              name="categoryId"
              control={control}
              render={({ field }) => (
                <ComboBox
                  selectedKey={field.value ? String(field.value) : null}
                  onSelectionChange={(key) => field.onChange(key ? Number(key) : undefined)}
                  className="w-full"
                >
                  <Label>Kategori *</Label>
                  <ComboBox.InputGroup>
                    <Input placeholder="Cari kategori..." />
                    <ComboBox.Trigger />
                  </ComboBox.InputGroup>
                  <ComboBox.Popover>
                    <ListBox>
                      {categories.map((c) => (
                        <ListBox.Item key={c.id} id={String(c.id)} textValue={c.name}>
                          {c.name}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </ComboBox.Popover>
                </ComboBox>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Controller
              name="vendorId"
              control={control}
              render={({ field }) => (
                <ComboBox
                  selectedKey={field.value ? String(field.value) : null}
                  onSelectionChange={(key) => field.onChange(key ? Number(key) : undefined)}
                  className="w-full"
                >
                  <Label>Vendor</Label>
                  <ComboBox.InputGroup>
                    <Input placeholder="Cari vendor..." />
                    <ComboBox.Trigger />
                  </ComboBox.InputGroup>
                  <ComboBox.Popover>
                    <ListBox>
                      {vendors.map((v) => (
                        <ListBox.Item key={v.id} id={String(v.id)} textValue={v.name}>
                          {v.name}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </ComboBox.Popover>
                </ComboBox>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Controller
              name="unitOfMeasure"
              control={control}
              render={({ field }) => (
                <Select selectedKey={field.value || "PCS"} onSelectionChange={(key) => field.onChange(String(key))} className="w-full">
                  <Label>Satuan</Label>
                  <HeroSelect.Trigger><Select.Value /><HeroSelect.Indicator /></HeroSelect.Trigger>
                  <HeroSelect.Popover>
                    <ListBox>
                      <ListBox.Item key="PCS" id="PCS" textValue="PCS">PCS<ListBox.ItemIndicator /></ListBox.Item>
                      <ListBox.Item key="SET" id="SET" textValue="SET">SET<ListBox.ItemIndicator /></ListBox.Item>
                      <ListBox.Item key="KG" id="KG" textValue="KG">KG<ListBox.ItemIndicator /></ListBox.Item>
                      <ListBox.Item key="LTR" id="LTR" textValue="LTR">LTR<ListBox.ItemIndicator /></ListBox.Item>
                      <ListBox.Item key="MTR" id="MTR" textValue="MTR">MTR<ListBox.ItemIndicator /></ListBox.Item>
                      <ListBox.Item key="BOX" id="BOX" textValue="BOX">BOX<ListBox.ItemIndicator /></ListBox.Item>
                    </ListBox>
                  </HeroSelect.Popover>
                </Select>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="minStock">Minimum Stok</Label>
            <Input id="minStock" type="number" {...register("minStock", { valueAsNumber: true })} placeholder="0" />
          </div>
        </FormSection>

        <FormSection title="Keuangan">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cost">Harga Beli (Rp)</Label>
            <InputGroup>
              <InputGroup.Prefix>Rp</InputGroup.Prefix>
              <Controller name="cost" control={control} render={({ field: f }) => <CurrencyInput id="cost" value={f.value} onChange={f.onChange} onBlur={f.onBlur} placeholder="0" />} />
            </InputGroup>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="price">Harga Jual (Rp)</Label>
            <InputGroup>
              <InputGroup.Prefix>Rp</InputGroup.Prefix>
              <Controller name="price" control={control} render={({ field: f }) => <CurrencyInput id="price" value={f.value} onChange={f.onChange} onBlur={f.onBlur} placeholder="0" />} />
            </InputGroup>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="standardCost">Standard Cost (Rp)</Label>
            <InputGroup>
              <InputGroup.Prefix>Rp</InputGroup.Prefix>
              <Controller name="standardCost" control={control} render={({ field: f }) => <CurrencyInput id="standardCost" value={f.value} onChange={f.onChange} onBlur={f.onBlur} placeholder="0" />} />
            </InputGroup>
          </div>
          <div className="flex flex-col gap-1.5">
            <Controller
              name="costingMethod"
              control={control}
              render={({ field }) => (
                <Select selectedKey={field.value || null} onSelectionChange={(key) => field.onChange(key ? String(key) : undefined)} className="w-full">
                  <Label>Metode Costing</Label>
                  <HeroSelect.Trigger><SelectValue placeholder="Pilih metode" /><HeroSelect.Indicator /></HeroSelect.Trigger>
                  <HeroSelect.Popover>
                    <ListBox>
                      <ListBox.Item key="average" id="average" textValue="Average">Average<ListBox.ItemIndicator /></ListBox.Item>
                      <ListBox.Item key="fifo" id="fifo" textValue="FIFO">FIFO<ListBox.ItemIndicator /></ListBox.Item>
                      <ListBox.Item key="standard" id="standard" textValue="Standard">Standard<ListBox.ItemIndicator /></ListBox.Item>
                    </ListBox>
                  </HeroSelect.Popover>
                </Select>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="purchasePrice">Purchase Price (Rp)</Label>
            <InputGroup>
              <InputGroup.Prefix>Rp</InputGroup.Prefix>
              <Controller name="purchasePrice" control={control} render={({ field: f }) => <CurrencyInput id="purchasePrice" value={f.value} onChange={f.onChange} onBlur={f.onBlur} placeholder="0" />} />
            </InputGroup>
          </div>
        </FormSection>

        <FormSection title="Lokasi Penyimpanan">
          <div className="flex flex-col gap-1.5">
            <Controller
              name="defaultWarehouseId"
              control={control}
              render={({ field }) => (
                <ComboBox
                  selectedKey={field.value ? String(field.value) : null}
                  onSelectionChange={(key) => {
                    field.onChange(key ? Number(key) : undefined)
                    setValue("defaultRackId", undefined)
                    setValue("defaultRackRowId", undefined)
                  }}
                  className="w-full"
                >
                  <Label>Gudang Default</Label>
                  <ComboBox.InputGroup>
                    <Input placeholder="Cari gudang..." />
                    <ComboBox.Trigger />
                  </ComboBox.InputGroup>
                  <ComboBox.Popover>
                    <ListBox>
                      {warehouses.map((w) => (
                        <ListBox.Item key={w.id} id={String(w.id)} textValue={w.name}>
                          {w.name}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </ComboBox.Popover>
                </ComboBox>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Controller
              name="defaultRackId"
              control={control}
              render={({ field }) => (
                <ComboBox
                  selectedKey={field.value ? String(field.value) : null}
                  onSelectionChange={(key) => {
                    field.onChange(key ? Number(key) : undefined)
                    setValue("defaultRackRowId", undefined)
                  }}
                  className="w-full"
                  isDisabled={!selectedWarehouseId}
                >
                  <Label>Rak</Label>
                  <ComboBox.InputGroup>
                    <Input placeholder="Cari rak..." />
                    <ComboBox.Trigger />
                  </ComboBox.InputGroup>
                  <ComboBox.Popover>
                    <ListBox>
                      {filteredRacks.map((r) => (
                        <ListBox.Item key={r.id} id={String(r.id)} textValue={r.name}>
                          {r.name}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </ComboBox.Popover>
                </ComboBox>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Controller
              name="defaultRackRowId"
              control={control}
              render={({ field }) => (
                <ComboBox
                  selectedKey={field.value ? String(field.value) : null}
                  onSelectionChange={(key) => field.onChange(key ? Number(key) : undefined)}
                  className="w-full"
                  isDisabled={!selectedRackId}
                >
                  <Label>Row</Label>
                  <ComboBox.InputGroup>
                    <Input placeholder="Cari row..." />
                    <ComboBox.Trigger />
                  </ComboBox.InputGroup>
                  <ComboBox.Popover>
                    <ListBox>
                      {filteredRackRows.map((r) => (
                        <ListBox.Item key={r.id} id={String(r.id)} textValue={r.name}>
                          {r.name}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </ComboBox.Popover>
                </ComboBox>
              )}
            />
          </div>
        </FormSection>

        <FormSection title="Lainnya" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Deskripsi</Label>
            <TextArea id="description" {...register("description")} rows={2} placeholder="Deskripsi item" />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <Switch
                isSelected={isProduct}
                onChange={setIsProduct}
                id="isProduct"
              >
                Tandai sebagai Produk
              </Switch>
            </div>
            <span className="text-xs text-muted">Aktifkan jika item ini merupakan produk jadi</span>
          </div>
        </FormSection>

        <FormActions>
          <Button onClick={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" disabled={isPending || uploading}>
            {isPending ? "Menyimpan..." : isEdit ? "Update" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
