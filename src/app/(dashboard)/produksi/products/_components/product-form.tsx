"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition, useEffect, useMemo } from "react"
import { createProduct, updateProduct } from "@/actions/manufacturing.actions"
import { Plus, Trash2 } from "lucide-react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { Button } from "@/components/ui/button"

interface MaterialRow {
  itemId: string
  qty: string
}

interface VehicleBrand {
  id: number
  name: string
}

interface VehicleModel {
  id: number
  name: string
  vehicleBrandId: number
}

interface ItemOption {
  id: number
  sku: string
  name: string
  unitOfMeasure: string
}

interface ProductEdit {
  id: number
  name: string
  code: string | null
  description: string | null
  vehicleBrandId: number | null
  vehicleModelId: number | null
  materials: { itemId: number; qty: number }[]
}

export function ProductForm({
  generatedCode,
  product,
  items,
}: {
  generatedCode: string
  product?: ProductEdit
  items: ItemOption[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [materials, setMaterials] = useState<MaterialRow[]>(
    product && product.materials.length > 0
      ? product.materials.map((m) => ({ itemId: String(m.itemId), qty: String(m.qty) }))
      : [{ itemId: "", qty: "" }]
  )
  const [vehicleBrands, setVehicleBrands] = useState<VehicleBrand[]>([])
  const [vehicleModels, setVehicleModels] = useState<VehicleModel[]>([])
  const [selectedBrandId, setSelectedBrandId] = useState<number | null>(product?.vehicleBrandId ?? null)
  const [selectedModelId, setSelectedModelId] = useState<number | null>(product?.vehicleModelId ?? null)

  useEffect(() => {
    // The /api/vehicle-brands and /api/vehicle-models endpoints return
    // paginated results: { data, total, page, pageSize }. We need the
    // .data array for the Combobox options.
    fetch("/api/vehicle-brands")
      .then((r) => r.json())
      .then((d) => setVehicleBrands(d.data ?? []))
      .catch(() => setVehicleBrands([]))
    fetch("/api/vehicle-models")
      .then((r) => r.json())
      .then((d) => setVehicleModels(d.data ?? []))
      .catch(() => setVehicleModels([]))
  }, [])

  const filteredModels = useMemo(() => {
    if (!selectedBrandId) return []
    return vehicleModels.filter(m => m.vehicleBrandId === selectedBrandId)
  }, [vehicleModels, selectedBrandId])

  const itemOptions = useMemo(
    () => items.map((it) => ({ value: String(it.id), label: `${it.sku} - ${it.name}` })),
    [items]
  )

  const uomById = useMemo(() => {
    const map = new Map<string, string>()
    items.forEach((it) => map.set(String(it.id), it.unitOfMeasure))
    return map
  }, [items])

  function addMaterialRow() {
    setMaterials([...materials, { itemId: "", qty: "" }])
  }

  function removeMaterialRow(index: number) {
    setMaterials(materials.filter((_, i) => i !== index))
  }

  function updateMaterial(index: number, field: keyof MaterialRow, value: string) {
    const updated = [...materials]
    updated[index][field] = value
    setMaterials(updated)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    // Append vehicle brand/model
    if (selectedBrandId) formData.set("vehicleBrandId", String(selectedBrandId))
    if (selectedModelId) formData.set("vehicleModelId", String(selectedModelId))

    // Append material rows
    materials.forEach((m) => {
      if (m.itemId && m.qty) {
        formData.append("materialItemId", m.itemId)
        formData.append("materialQty", m.qty)
      }
    })

    startTransition(async () => {
      const result = product?.id ? await updateProduct(product.id, formData) : await createProduct(formData)
      if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
      showSuccess(product?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
      router.push("/produksi/products")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Produk *</Label>
          <Input id="name" name="name" placeholder="Nama produk" required defaultValue={product?.name ?? ""} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Kode Produk</Label>
          <Input id="code" name="code" value={product?.code ?? generatedCode} readOnly className="bg-default-soft font-mono" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vehicle-brand">Merek Kendaraan</Label>
          <Combobox
            id="vehicle-brand"
            value={selectedBrandId ? String(selectedBrandId) : null}
            onChange={(key) => {
              const val = key ? Number(key) : null
              setSelectedBrandId(val)
              setSelectedModelId(null)
            }}
            placeholder="Cari merek kendaraan..."
            options={vehicleBrands.map((b) => ({ value: String(b.id), label: b.name }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vehicle-model">Model Kendaraan</Label>
          <Combobox
            id="vehicle-model"
            value={selectedModelId ? String(selectedModelId) : null}
            onChange={(key) => setSelectedModelId(key ? Number(key) : null)}
            placeholder="Cari model kendaraan..."
            disabled={!selectedBrandId}
            options={filteredModels.map((m) => ({ value: String(m.id), label: m.name }))}
          />
        </div>

        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="description">Deskripsi</Label>
          <Textarea id="description" name="description" rows={3} placeholder="Deskripsi produk (opsional)" defaultValue={product?.description ?? ""} />
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-header">
          <h3 className="form-section-title">Material (BOM)</h3>
          <Button onPress={addMaterialRow} aria-label="Tambah material" type="button">
            <Plus size={14} /> Tambah Material
          </Button>
        </div>

        <div className="overflow-x-auto">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Barang</DetailTableTh>
              <DetailTableTh>Jml</DetailTableTh>
              <DetailTableTh>Aksi</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {materials.map((m, index) => (
                <DetailTableRow key={index}>
                  <DetailTableTd>
                    <Combobox
                      value={m.itemId || null}
                      onChange={(key) => updateMaterial(index, "itemId", key ?? "")}
                      placeholder="Cari barang..."
                      options={itemOptions}
                    />
                  </DetailTableTd>
                  <DetailTableTd>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={m.qty}
                        onChange={(e) => updateMaterial(index, "qty", e.target.value)}
                        placeholder="Jml"
                      />
                      <span className="shrink-0 text-sm font-medium text-muted-foreground min-w-[2.5rem]">
                        {m.itemId ? (uomById.get(m.itemId) ?? "") : ""}
                      </span>
                    </div>
                  </DetailTableTd>
                  <DetailTableTd>
                    <Button onPress={() => removeMaterialRow(index)} aria-label="Hapus material" type="button" isDisabled={materials.length === 1}>
                      <Trash2 size={14} />
                    </Button>
                  </DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button onPress={() => router.back()} type="button">Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending} id="submit-product">
          {isPending ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
