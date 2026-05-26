"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition, useEffect, useMemo } from "react"
import { createProduct } from "@/actions/manufacturing.actions"
import { Plus, Trash2 } from "lucide-react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Input, TextArea, Label, ComboBox, ListBox } from "@heroui/react"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

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

export default function CreateProductPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [materials, setMaterials] = useState<MaterialRow[]>([{ itemId: "", qty: "" }])
  const [vehicleBrands, setVehicleBrands] = useState<VehicleBrand[]>([])
  const [vehicleModels, setVehicleModels] = useState<VehicleModel[]>([])
  const [selectedBrandId, setSelectedBrandId] = useState<number | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null)

  useEffect(() => {
    fetch("/api/vehicle-brands").then(r => r.json()).then(setVehicleBrands).catch(() => {})
    fetch("/api/vehicle-models").then(r => r.json()).then(setVehicleModels).catch(() => {})
  }, [])

  const filteredModels = useMemo(() => {
    if (!selectedBrandId) return []
    return vehicleModels.filter(m => m.vehicleBrandId === selectedBrandId)
  }, [vehicleModels, selectedBrandId])

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
      await createProduct(formData)
      router.push("/manufacturing/products")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Manufacturing", href: "/manufacturing" },
  { label: "Products", href: "/manufacturing/products" },
  { label: "Create" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Produk (BOM)</h1>
      </div>
      <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nama Produk *</Label>
            <Input id="name" name="name" placeholder="Nama produk" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sku">SKU</Label>
            <Input id="sku" name="sku" placeholder="SKU produk" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">Kode Produk</Label>
            <Input id="code" name="code" placeholder="Kode produk (opsional)" />
          </div>

          <div className="flex flex-col gap-1.5">
            <ComboBox
              selectedKey={selectedBrandId ? String(selectedBrandId) : null}
              onSelectionChange={(key) => {
                const val = key ? Number(key) : null
                setSelectedBrandId(val)
                setSelectedModelId(null)
              }}
              className="w-full"
            >
              <Label>Vehicle Brand</Label>
              <ComboBox.InputGroup>
                <Input placeholder="Cari brand kendaraan..." />
                <ComboBox.Trigger />
              </ComboBox.InputGroup>
              <ComboBox.Popover>
                <ListBox>
                  {vehicleBrands.map((b) => (
                    <ListBox.Item key={b.id} id={String(b.id)} textValue={b.name}>
                      {b.name}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </ComboBox.Popover>
            </ComboBox>
          </div>

          <div className="flex flex-col gap-1.5">
            <ComboBox
              selectedKey={selectedModelId ? String(selectedModelId) : null}
              onSelectionChange={(key) => setSelectedModelId(key ? Number(key) : null)}
              className="w-full"
              isDisabled={!selectedBrandId}
            >
              <Label>Vehicle Model</Label>
              <ComboBox.InputGroup>
                <Input placeholder="Cari model kendaraan..." />
                <ComboBox.Trigger />
              </ComboBox.InputGroup>
              <ComboBox.Popover>
                <ListBox>
                  {filteredModels.map((m) => (
                    <ListBox.Item key={m.id} id={String(m.id)} textValue={m.name}>
                      {m.name}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </ComboBox.Popover>
            </ComboBox>
          </div>

          <div className="flex flex-col gap-1.5 col-span-full">
            <Label htmlFor="description">Deskripsi</Label>
            <TextArea id="description" name="description" rows={3} placeholder="Deskripsi produk (opsional)" />
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-header">
            <h3 className="form-section-title">Material (BOM)</h3>
            <button type="button" onClick={addMaterialRow} aria-label="Tambah material" className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default hover:bg-surface-secondary transition-all">
              <Plus size={14} /> Tambah Material
            </button>
          </div>

          <div className="overflow-x-auto">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Item ID</DetailTableTh>
                <DetailTableTh>Qty</DetailTableTh>
                <DetailTableTh>Aksi</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {materials.map((m, index) => (
                  <DetailTableRow key={index}>
                    <DetailTableTd>
                      <Input
                        type="number"
                        value={m.itemId}
                        onChange={(e) => updateMaterial(index, "itemId", e.target.value)}
                        placeholder="Item ID"
                      />
                    </DetailTableTd>
                    <DetailTableTd>
                      <Input
                        type="number"
                        step="0.01"
                        value={m.qty}
                        onChange={(e) => updateMaterial(index, "qty", e.target.value)}
                        placeholder="Qty"
                      />
                    </DetailTableTd>
                    <DetailTableTd>
                      <button type="button" onClick={() => removeMaterialRow(index)} aria-label="Hapus material" className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-danger hover:bg-danger/10 transition-all" disabled={materials.length === 1}>
                        <Trash2 size={14} />
                      </button>
                    </DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
          <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
          <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="submit-product">
            {isPending ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </form>
    </div>
  )
}
