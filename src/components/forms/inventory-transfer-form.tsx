"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createInventoryTransfer, updateInventoryTransfer } from "@/actions/inventory.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, ComboBox, ListBox, Label } from "@heroui/react"
import { Button } from "@/components/ui/page-header"

interface TransferFormProps {
  warehouses: { id: number; name: string
}[]
  transfer?: { id: number; sourceWarehouseId: number; destinationWarehouseId: number; date: string; notes?: string | null; items?: Array<{ itemId: number; qty: number }> }
  items: { id: number; sku: string; name: string; qtyOnHand: string }[]
}

interface TransferItem { itemId: number; qty: number }

export function InventoryTransferForm({ warehouses, items, transfer }: TransferFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [sourceId, setSourceId] = useState("")
  const [destId, setDestId] = useState("")
  const [transferItems, setTransferItems] = useState<TransferItem[]>([{ itemId: 0, qty: 1 }])

  function addItem() { setTransferItems([...transferItems, { itemId: 0, qty: 1 }]) }
  function removeItem(i: number) { setTransferItems(transferItems.filter((_, idx) => idx !== i)) }
  function updateItem(i: number, field: keyof TransferItem, value: string | number) {
    const updated = [...transferItems]; updated[i] = { ...updated[i], [field]: value }; setTransferItems(updated)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.append("sourceWarehouseId", sourceId)
        formData.append("destinationWarehouseId", destId)
        formData.append("date", new Date().toISOString().split("T")[0])
        formData.append("items", JSON.stringify(transferItems))
        transfer?.id ? await updateInventoryTransfer(transfer.id, formData) : await createInventoryTransfer(formData)
        showSuccess(transfer?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/inventory/transfers")
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
          <ComboBox selectedKey={sourceId || null} onSelectionChange={(key) => setSourceId(key ? String(key) : "")} className="w-full" isRequired>
            <Label>Dari Gudang *</Label>
            <ComboBox.InputGroup><Input placeholder="Cari gudang asal..." /><ComboBox.Trigger /></ComboBox.InputGroup>
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
          <ComboBox selectedKey={destId || null} onSelectionChange={(key) => setDestId(key ? String(key) : "")} className="w-full" isRequired>
            <Label>Ke Gudang *</Label>
            <ComboBox.InputGroup><Input placeholder="Cari gudang tujuan..." /><ComboBox.Trigger /></ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {warehouses.filter((w) => String(w.id) !== sourceId).map((w) => (
                  <ListBox.Item key={w.id} id={String(w.id)} textValue={w.name}>{w.name}</ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>
      </div>

      <div style={{ marginTop: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Barang</h3>
          <Button onPress={addItem} variant="secondary" size="sm">+ Tambah</Button>
        </div>
        <table className="w-full border-collapse" style={{ fontSize: "0.8125rem" }}>
          <thead><tr><th>Item</th><th>Qty</th><th></th></tr></thead>
          <tbody>
            {transferItems.map((item, i) => (
              <tr key={i}>
                <td>
                  <select value={item.itemId} onChange={(e) => updateItem(i, "itemId", Number(e.target.value))} className="form-input" style={{ fontSize: "0.8125rem", padding: "6px" }}>
                    <option value={0}>Pilih Item</option>
                    {items.map((it) => <option key={it.id} value={it.id}>{it.sku} - {it.name} (stok: {Number(it.qtyOnHand)})</option>)}
                  </select>
                </td>
                <td><input type="number" min={1} value={item.qty} onChange={(e) => updateItem(i, "qty", Number(e.target.value))} className="form-input" style={{ fontSize: "0.8125rem", padding: "6px", width: "80px" }} /></td>
                <td>{transferItems.length > 1 && <Button onPress={() => removeItem(i)} variant="danger-soft" size="sm">×</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button onPress={() => router.back()} >Batal</Button>
        <Button isDisabled={isPending} >{isPending ? "Memproses..." : "Buat Transfer"}</Button>
      </div>
    </form>
  )
}
