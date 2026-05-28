"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createPurchaseReturn, updatePurchaseReturn } from "@/actions/purchase.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, ComboBox, ListBox, Label } from "@heroui/react"
import { Button } from "@/components/ui/page-header"

interface PurchaseReturnFormProps {
  purchaseOrders: { id: number; documentNo: string
}[]
  returnData?: { id: number; purchaseOrderId: number; date: string; reason?: string | null; items?: Array<{ itemId: number; qty: number; notes?: string }> }
  items: { id: number; sku: string; name: string }[]
}

interface ReturnItem {
  itemId: number
  qty: number
}

export function PurchaseReturnForm({ purchaseOrders, items, returnData }: PurchaseReturnFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([{ itemId: 0, qty: 1 }])

  function addItem() {
    setReturnItems([...returnItems, { itemId: 0, qty: 1 }])
  }

  function removeItem(index: number) {
    setReturnItems(returnItems.filter((_, i) => i !== index))
  }

  function updateItem(index: number, field: keyof ReturnItem, value: number) {
    const updated = [...returnItems]
    updated[index] = { ...updated[index], [field]: value }
    setReturnItems(updated)
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        formData.set("date", date)
        formData.append("items", JSON.stringify(returnItems))
        const result = returnData?.id ? await updatePurchaseReturn(returnData.id, formData) : await createPurchaseReturn(formData)
        if (result.success) {
          showSuccess(returnData?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
          router.push("/purchase/returns")
          router.refresh()
        }
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <ComboBox name="purchaseOrderId" className="w-full" isRequired>
            <Label>Purchase Order *</Label>
            <ComboBox.InputGroup><Input placeholder="Cari purchase order..." /><ComboBox.Trigger /></ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {purchaseOrders.map((po) => (
                  <ListBox.Item key={po.id} id={String(po.id)} textValue={po.documentNo}>{po.documentNo}</ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>

        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Tanggal"
            name="date"
            value={date}
            onChange={(val) => setDate(val)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="reason">Alasan Retur</Label>
          <TextArea id="reason" name="reason" rows={3} placeholder="Alasan pengembalian barang ke vendor..." defaultValue={returnData?.reason ?? ""} />
        </div>
      </div>

      {/* Items */}
      <div style={{ marginTop: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Item Retur</h3>
          <Button onPress={addItem} variant="secondary" size="sm">+ Tambah Item</Button>
        </div>

        <table className="w-full border-collapse" style={{ fontSize: "0.8125rem" }}>
          <thead>
            <tr>
              <th>Item</th>
              <th style={{ width: "100px" }}>Qty</th>
              <th style={{ width: "40px" }}></th>
            </tr>
          </thead>
          <tbody>
            {returnItems.map((ri, index) => (
              <tr key={index}>
                <td>
                  <select
                    value={ri.itemId}
                    onChange={(e) => updateItem(index, "itemId", Number(e.target.value))}
                    className="form-input"
                    style={{ fontSize: "0.8125rem", padding: "6px 8px" }}
                  >
                    <option value={0}>Pilih Item</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>{item.sku} - {item.name}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    value={ri.qty}
                    onChange={(e) => updateItem(index, "qty", Number(e.target.value))}
                    className="form-input"
                    style={{ fontSize: "0.8125rem", padding: "6px 8px" }}
                    min={1}
                  />
                </td>
                <td>
                  {returnItems.length > 1 && (
                    <Button onPress={() => removeItem(index)} variant="danger-soft" size="sm">×</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button onPress={() => router.back()} >Batal</Button>
        <Button isDisabled={isPending}  id="submit-purchase-return">
          {isPending ? "Menyimpan..." : returnData?.id ? "Update" : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
