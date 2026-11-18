"use client"

import { useRouter } from "next/navigation"
import { useCallback, useRef, useState, useTransition, useEffect, useMemo } from "react"
import { createProduct, updateProduct } from "@/actions/manufacturing.actions"
import { Plus, Trash2 } from "@/components/ui/fontawesome-icons"
import { showSuccess, showError } from "@/lib/utils/toast"
import { runUiAction } from "@/components/ui/async-action"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { DataTable } from "@/components/ui/data-table"
import { createColumnHelper } from "@/lib/table"
import { Button } from "@/components/ui/button"
import { FormActions } from "@/components/ui/form-section"

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
  isProduct: boolean
}

interface ProductEdit {
  id: number
  name: string
  code: string | null
  description: string | null
  vehicleBrandId: number | null
  vehicleModelId: number | null
  inventoryItemId: number | null
  materials: { itemId: number; qty: number }[]
}

interface MaterialTableRow extends MaterialRow {
  id: number
}

const materialColumnHelper = createColumnHelper<MaterialTableRow>()

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
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())
  const [materials, setMaterials] = useState<MaterialRow[]>(
    product && product.materials.length > 0
      ? product.materials.map((m) => ({ itemId: String(m.itemId), qty: String(m.qty) }))
      : [{ itemId: "", qty: "" }]
  )
  const [vehicleBrands, setVehicleBrands] = useState<VehicleBrand[]>([])
  const [vehicleModels, setVehicleModels] = useState<VehicleModel[]>([])
  const [selectedBrandId, setSelectedBrandId] = useState<number | null>(product?.vehicleBrandId ?? null)
  const [selectedModelId, setSelectedModelId] = useState<number | null>(product?.vehicleModelId ?? null)
  const [inventoryItemId, setInventoryItemId] = useState<number | null>(product?.inventoryItemId ?? null)

  useEffect(() => {
    // The /api/vehicle-brands and /api/vehicle-models endpoints return
    // paginated results: { data, total, page, pageSize }. We need the
    // .data array for the Combobox options.
    async function loadBrands() {
      try {
        const r = await fetch("/api/vehicle-brands")
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const d = await r.json()
        setVehicleBrands(d.data ?? [])
      } catch {
        setVehicleBrands([])
        showError("Gagal memuat daftar merek")
      }
    }
    async function loadModels() {
      try {
        const r = await fetch("/api/vehicle-models?pageSize=500")
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const d = await r.json()
        setVehicleModels(d.data ?? [])
      } catch {
        setVehicleModels([])
        showError("Gagal memuat daftar model")
      }
    }
    void loadBrands()
    void loadModels()
  }, [])

  const filteredModels = useMemo(() => {
    if (!selectedBrandId) return []
    return vehicleModels.filter(m => m.vehicleBrandId === selectedBrandId)
  }, [vehicleModels, selectedBrandId])

  const itemOptions = useMemo(
    () => items.map((it) => ({ value: String(it.id), label: `${it.sku} - ${it.name}` })),
    [items]
  )
  const outputItemOptions = useMemo(
    () => items.filter((it) => it.isProduct).map((it) => ({ value: String(it.id), label: `${it.sku} - ${it.name}` })),
    [items],
  )

  const uomById = useMemo(() => {
    const map = new Map<string, string>()
    items.forEach((it) => map.set(String(it.id), it.unitOfMeasure))
    return map
  }, [items])

  function addMaterialRow() {
    setMaterials((prev) => [...prev, { itemId: "", qty: "" }])
  }

  const removeMaterialRow = useCallback((index: number) => {
    setMaterials((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const updateMaterial = useCallback((index: number, field: keyof MaterialRow, value: string) => {
    setMaterials((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }, [])

  const tableData = useMemo<MaterialTableRow[]>(
    () => materials.map((m, index) => ({ ...m, id: index })),
    [materials],
  )

  const columns = useMemo(
    () => [
      materialColumnHelper.accessor("itemId", {
        header: "Barang",
        meta: { mobilePrimary: true },
        cell: (info) => {
          const index = info.row.original.id
          return (
            <Combobox
              value={info.getValue() || null}
              onChange={(key) => updateMaterial(index, "itemId", key ?? "")}
              placeholder="Cari barang..."
              options={itemOptions}
            />
          )
        },
      }),
      materialColumnHelper.accessor("qty", {
        header: "Jml",
        cell: (info) => {
          const m = info.row.original
          const index = m.id
          return (
            <div className="flex items-center gap-2">
              <Input
                type="text"
                inputMode="decimal"
                value={m.qty}
                onChange={(e) => {
                  const normalized = e.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, "")
                  const dotIndex = normalized.indexOf(".")
                  const sanitized =
                    dotIndex === -1
                      ? normalized
                      : normalized.slice(0, dotIndex + 1) + normalized.slice(dotIndex + 1).replace(/\./g, "")
                  updateMaterial(index, "qty", sanitized)
                }}
                placeholder="0"
                className="font-mono tabular-nums"
              />
              <span className="shrink-0 text-sm font-medium text-muted-foreground min-w-[2.5rem]">
                {m.itemId ? (uomById.get(m.itemId) ?? "") : ""}
              </span>
            </div>
          )
        },
      }),
      materialColumnHelper.display({
        id: "actions",
        header: "Aksi",
        meta: { align: "right" },
        cell: (info) => {
          const index = info.row.original.id
          return (
            <Button
              onPress={() => removeMaterialRow(index)}
              aria-label={`Hapus bahan baris ${index + 1}`}
              type="button"
              isDisabled={materials.length === 1}
            >
              <Trash2 size={14} />
            </Button>
          )
        },
      }),
    ],
    [itemOptions, materials.length, removeMaterialRow, uomById, updateMaterial],
  )

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    // Append vehicle brand/model (send "" when cleared so edit can unset them)
    formData.set("vehicleBrandId", selectedBrandId ? String(selectedBrandId) : "")
    formData.set("vehicleModelId", selectedModelId ? String(selectedModelId) : "")
    formData.set("inventoryItemId", inventoryItemId ? String(inventoryItemId) : "")
    if (!product?.id) formData.set("idempotencyKey", idempotencyKeyRef.current)

    // Validate and append material rows
    for (const m of materials) {
      if (m.itemId) {
        const qtyNum = Number(m.qty)
        if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
          showError("Jumlah bahan (BOM) harus lebih besar dari 0")
          return
        }
        formData.append("materialItemId", m.itemId)
        formData.append("materialQty", m.qty)
      }
    }

    startTransition(async () => {
      await runUiAction(async () => {
        const result = product?.id ? await updateProduct(product.id, formData) : await createProduct(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        if (!product?.id) idempotencyKeyRef.current = crypto.randomUUID()
        showSuccess(product?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/produksi/products")
        router.refresh()
      }, "Gagal menyimpan data")
    })
  }

  return (
    <form onSubmit={handleSubmit} className="sm:bg-surface sm:rounded-xl sm:border sm:border-default sm:shadow-sm sm:p-6">
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
          <Label htmlFor="inventory-item">Barang Persediaan Hasil Produksi</Label>
          <Combobox
            id="inventory-item"
            value={inventoryItemId ? String(inventoryItemId) : null}
            onChange={(key) => setInventoryItemId(key ? Number(key) : null)}
            placeholder="Pilih barang produk jadi (opsional)"
            options={outputItemOptions}
          />
          <p className="text-xs text-muted-foreground">Hubungkan ke barang persediaan bertanda Produk agar penyelesaian perintah produksi dapat menambah stok barang jadi.</p>
        </div>

        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="description">Deskripsi</Label>
          <Textarea id="description" name="description" rows={3} placeholder="Deskripsi produk (opsional)" defaultValue={product?.description ?? ""} />
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-header">
          <h3 className="form-section-title">Bahan (BOM)</h3>
          <Button onPress={addMaterialRow} aria-label="Tambah bahan" type="button">
            <Plus size={14} /> Tambah Bahan
          </Button>
        </div>

        <DataTable
          data={tableData}
          columns={columns}
          ariaLabel="Bahan BOM"
          selectable={false}
          enableColumnToggle={false}
          enableExport={false}
          showPagination={false}
          pageSize={50}
        />
      </div>

      <FormActions>
        <Button className="w-full sm:w-auto" onPress={() => router.back()} type="button">Batal</Button>
        <Button className="w-full sm:w-auto" type="submit" variant="primary" isDisabled={isPending} id="submit-product">
          {isPending ? "Menyimpan..." : "Simpan"}
        </Button>
      </FormActions>
    </form>
  )
}
