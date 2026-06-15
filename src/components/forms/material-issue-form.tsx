"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createMaterialIssue, updateMaterialIssue } from "@/actions/inventory.actions"
import { useState } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Combobox } from "@/components/ui/combobox"
import { Button } from "@/components/ui/button"

interface MaterialIssueFormProps {
  warehouses: { id: number; name: string
}[]
  issue?: { id: number; workOrderId: number; warehouseId?: number; date: string; notes?: string | null; items?: Array<{ itemId: number; qty: number; warehouseId?: number }> }
  items: { id: number; sku: string; name: string; qtyOnHand: string; cost: string }[]
}

interface MIItem { itemId: number; qty: number; unitCost: number }

export function MaterialIssueForm({ warehouses, items, issue }: MaterialIssueFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [warehouseId, setWarehouseId] = useState(issue?.warehouseId ? String(issue.warehouseId) : "")
  const [miItems, setMiItems] = useState<MIItem[]>([{ itemId: 0, qty: 1, unitCost: 0 }])

  function addItem() { setMiItems([...miItems, { itemId: 0, qty: 1, unitCost: 0 }]) }
  function removeItem(i: number) { setMiItems(miItems.filter((_, idx) => idx !== i)) }
  function updateItem(i: number, field: keyof MIItem, value: string | number) {
    const updated = [...miItems]; updated[i] = { ...updated[i], [field]: value }
    if (field === "itemId") {
      const item = items.find((it) => it.id === Number(value))
      if (item) updated[i].unitCost = Number(item.cost)
    }
    setMiItems(updated)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.append("warehouseId", warehouseId)
        formData.append("date", new Date().toISOString().split("T")[0])
        formData.append("items", JSON.stringify(miItems))
        const result = issue?.id ? await updateMaterialIssue(issue.id, formData) : await createMaterialIssue(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        showSuccess(issue?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/inventaris/pengeluaran-material")
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
          <Label htmlFor="warehouseId">Gudang *</Label>
          <Combobox
            id="warehouseId"
            options={warehouses.map((w) => ({ value: String(w.id), label: w.name }))}
            value={warehouseId || null}
            onChange={(key) => setWarehouseId(key ? String(key) : "")}
            placeholder="Cari gudang..."
          />
        </div>
      </div>

      <div style={{ marginTop: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Material</h3>
          <Button type="button" onPress={addItem} variant="secondary" size="sm">+ Tambah</Button>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[640px]" style={{ fontSize: "0.8125rem" }}>
          <thead><tr><th>Item</th><th>Jumlah</th><th>Harga Satuan</th><th>Total</th><th></th></tr></thead>
          <tbody>
            {miItems.map((item, i) => (
              <tr key={i}>
                <td>
                  <Combobox
                    options={items.map((it) => ({ value: String(it.id), label: `${it.sku} - ${it.name}` }))}
                    value={item.itemId ? String(item.itemId) : null}
                    onChange={(key) => updateItem(i, "itemId", key ? Number(key) : 0)}
                    placeholder="Cari item..."
                    className="w-full"
                  />
                </td>
                <td><input type="number" min={1} value={item.qty} onChange={(e) => updateItem(i, "qty", Number(e.target.value))} aria-label={`Jumlah baris ${i + 1}`} className="form-input" style={{ fontSize: "0.8125rem", padding: "6px", width: "80px" }} /></td>
                <td className="text-right">Rp {item.unitCost.toLocaleString("id-ID")}</td>
                <td className="text-right">Rp {(item.qty * item.unitCost).toLocaleString("id-ID")}</td>
                <td>{miItems.length > 1 && <Button type="button" onPress={() => removeItem(i)} variant="danger-soft" size="sm" aria-label={`Hapus baris ${i + 1}`}>×</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" isDisabled={isPending} >{isPending ? "Memproses..." : "Buat Pengeluaran Material"}</Button>
      </div>
    </form>
  )
}
