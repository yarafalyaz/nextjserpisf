"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createProduct } from "@/actions/manufacturing.actions"
import { Plus, Trash2 } from "lucide-react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

interface MaterialRow {
  itemId: string
  qty: string
}

export default function CreateProductPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [materials, setMaterials] = useState<MaterialRow[]>([{ itemId: "", qty: "" }])

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
            <label htmlFor="name" className="text-sm font-medium text-foreground">Nama Produk *</label>
            <input id="name" name="name" className="form-input" placeholder="Nama produk" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="sku" className="text-sm font-medium text-foreground">SKU</label>
            <input id="sku" name="sku" className="form-input" placeholder="SKU produk" />
          </div>

          <div className="flex flex-col gap-1.5 col-span-full">
            <label htmlFor="description" className="text-sm font-medium text-foreground">Deskripsi</label>
            <textarea id="description" name="description" className="form-input" rows={3} placeholder="Deskripsi produk (opsional)" />
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-header">
            <h3 className="form-section-title">Material (BOM)</h3>
            <button type="button" onClick={addMaterialRow} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -secondary">
              <Plus size={14} /> Tambah Material
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th>Item ID</th>
                  <th>Qty</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m, index) => (
                  <tr key={index}>
                    <td>
                      <input
                        type="number"
                        value={m.itemId}
                        onChange={(e) => updateMaterial(index, "itemId", e.target.value)}
                        className="form-input"
                        placeholder="Item ID"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={m.qty}
                        onChange={(e) => updateMaterial(index, "qty", e.target.value)}
                        className="form-input"
                        placeholder="Qty"
                      />
                    </td>
                    <td>
                      <button type="button" onClick={() => removeMaterialRow(index)} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -ghost" disabled={materials.length === 1}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
