"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createMaterialIssue, updateMaterialIssue } from "@/actions/inventory.actions"
import { useState } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, ComboBox, ListBox, Label } from "@heroui/react"
import { Button } from "@/components/ui/page-header"

interface MaterialIssueFormProps {
  warehouses: { id: number; name: string
}[]
  issue?: { id: number; workOrderId: number; date: string; notes?: string | null; items?: Array<{ itemId: number; qty: number; warehouseId?: number }> }
  items: { id: number; sku: string; name: string; qtyOnHand: string; cost: string }[]
}

interface MIItem { itemId: number; qty: number; unitCost: number }

export function MaterialIssueForm({ warehouses, items, issue }: MaterialIssueFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [warehouseId, setWarehouseId] = useState("")
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
        issue?.id ? await updateMaterialIssue(issue.id, formData) : await createMaterialIssue(formData)
        showSuccess(issue?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/inventory/material-issues")
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
          <ComboBox selectedKey={warehouseId || null} onSelectionChange={(key) => setWarehouseId(key ? String(key) : "")} className="w-full" isRequired>
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
      </div>

      <div style={{ marginTop: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Materials</h3>
          <Button onClick={addItem} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -secondary">+ Tambah</Button>
        </div>
        <table className="w-full border-collapse" style={{ fontSize: "0.8125rem" }}>
          <thead><tr><th>Item</th><th>Qty</th><th>Unit Cost</th><th>Total</th><th></th></tr></thead>
          <tbody>
            {miItems.map((item, i) => (
              <tr key={i}>
                <td>
                  <select value={item.itemId} onChange={(e) => updateItem(i, "itemId", Number(e.target.value))} className="form-input" style={{ fontSize: "0.8125rem", padding: "6px" }}>
                    <option value={0}>Pilih Item</option>
                    {items.map((it) => <option key={it.id} value={it.id}>{it.sku} - {it.name}</option>)}
                  </select>
                </td>
                <td><input type="number" min={1} value={item.qty} onChange={(e) => updateItem(i, "qty", Number(e.target.value))} className="form-input" style={{ fontSize: "0.8125rem", padding: "6px", width: "80px" }} /></td>
                <td className="text-right">Rp {item.unitCost.toLocaleString("id-ID")}</td>
                <td className="text-right">Rp {(item.qty * item.unitCost).toLocaleString("id-ID")}</td>
                <td>{miItems.length > 1 && <Button onClick={() => removeItem(i)} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -ghost" style={{ color: "var(--color-danger)" }}>×</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button onClick={() => router.back()} >Batal</Button>
        <Button disabled={isPending} >{isPending ? "Memproses..." : "Buat Material Issue"}</Button>
      </div>
    </form>
  )
}
