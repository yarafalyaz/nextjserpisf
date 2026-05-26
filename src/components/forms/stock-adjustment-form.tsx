// @ts-nocheck
"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createStockAdjustment, updateStockAdjustment } from "@/actions/inventory.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, Label, ComboBox, ListBox, TextArea } from "@heroui/react"

interface AdjustmentFormProps {
  warehouses: { id: number; name: string
}[]
  adjustment?: any
  items: { id: number; sku: string; name: string; qtyOnHand: string; cost: string }[]
}

interface AdjItem {
  itemId: number
  currentQty: number
  newQty: number
  unitCost: number
  reason: string
}

export function StockAdjustmentForm({ warehouses, items, adjustment }: AdjustmentFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [warehouseId, setWarehouseId] = useState("")
  const [type, setType] = useState(adjustment?.type ?? "increase")
  const [adjItems, setAdjItems] = useState<AdjItem[]>([{ itemId: 0, currentQty: 0, newQty: 0, unitCost: 0, reason: "" }])

  function addItem() {
    setAdjItems([...adjItems, { itemId: 0, currentQty: 0, newQty: 0, unitCost: 0, reason: "" }])
  }

  function removeItem(index: number) {
    setAdjItems(adjItems.filter((_, i) => i !== index))
  }

  function updateItem(index: number, field: keyof AdjItem, value: any) {
    const updated = [...adjItems]
    updated[index] = { ...updated[index], [field]: value }
    if (field === "itemId") {
      const item = items.find((i) => i.id === Number(value))
      if (item) {
        updated[index].currentQty = Number(item.qtyOnHand)
        updated[index].unitCost = Number(item.cost)
      }
    }
    setAdjItems(updated)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.append("warehouseId", warehouseId)
        formData.append("date", new Date().toISOString().split("T")[0])
        formData.append("items", JSON.stringify(adjItems))
        formData.append("type", type)
        const notesValue = (e.currentTarget.querySelector('[name="notes"]') as HTMLTextAreaElement)?.value || ""
        formData.append("notes", notesValue)
        adjustment?.id ? await updateStockAdjustment(adjustment.id, formData) : await createStockAdjustment(formData)
        showSuccess(adjustment?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/inventory/adjustments")
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
          <ComboBox
            selectedKey={warehouseId || null}
            onSelectionChange={(key) => setWarehouseId(String(key))}
            className="w-full"
          >
            <Label>Gudang *</Label>
            <ComboBox.InputGroup><Input placeholder="Cari gudang..." /><ComboBox.Trigger /></ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {warehouses.map((w) => (
                  <ListBox.Item key={w.id} id={String(w.id)} textValue={w.name}>{w.name}</ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Tipe *</Label>
          <select name="type" value={type} onChange={(e) => setType(e.target.value)} className="form-input">
            <option value="increase">Increase</option>
            <option value="decrease">Decrease</option>
            <option value="recount">Recount</option>
            <option value="correction">Correction</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <TextArea name="notes" label="Catatan" placeholder="Catatan tambahan (opsional)" defaultValue={adjustment?.notes || ""} />
        </div>
      </div>

      <div style={{ marginTop: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Items</h3>
          <button type="button" onClick={addItem} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -secondary">+ Tambah Item</button>
        </div>
        <table className="w-full border-collapse" style={{ fontSize: "0.8125rem" }}>
          <thead>
            <tr><th>Item</th><th>Stok Saat Ini</th><th>Stok Baru</th><th>Selisih</th><th>Alasan</th><th></th></tr>
          </thead>
          <tbody>
            {adjItems.map((item, i) => (
              <tr key={i}>
                <td>
                  <select value={item.itemId} onChange={(e) => updateItem(i, "itemId", e.target.value)} className="form-input" style={{ fontSize: "0.8125rem", padding: "6px" }}>
                    <option value={0}>Pilih Item</option>
                    {items.map((it) => <option key={it.id} value={it.id}>{it.sku} - {it.name}</option>)}
                  </select>
                </td>
                <td className="text-right">{item.currentQty}</td>
                <td><input type="number" value={item.newQty} onChange={(e) => updateItem(i, "newQty", Number(e.target.value))} className="form-input" style={{ fontSize: "0.8125rem", padding: "6px", width: "80px" }} /></td>
                <td className={`text-right ${item.newQty - item.currentQty > 0 ? "text-success" : item.newQty - item.currentQty < 0 ? "text-danger" : ""}`}>
                  {item.newQty - item.currentQty > 0 ? "+" : ""}{item.newQty - item.currentQty}
                </td>
                <td><input type="text" value={item.reason} onChange={(e) => updateItem(i, "reason", e.target.value)} className="form-input" style={{ fontSize: "0.8125rem", padding: "6px" }} placeholder="Alasan" /></td>
                <td>{adjItems.length > 1 && <button type="button" onClick={() => removeItem(i)} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -ghost" style={{ color: "var(--color-danger)" }}>×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">{isPending ? "Menyimpan..." : adjustment?.id ? "Update" : "Simpan"}</button>
      </div>
    </form>
  )
}
