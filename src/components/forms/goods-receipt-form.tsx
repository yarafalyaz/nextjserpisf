// @ts-nocheck
"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createGoodsReceipt, updateGoodsReceipt } from "@/actions/purchase.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, ComboBox, ListBox, Label } from "@heroui/react"

interface GRFormProps {
  purchaseOrders: any[]
  warehouses: { id: number; name: string
}[]
  receipt?: any
  defaultPoId?: number
}

export function GoodsReceiptForm({ purchaseOrders, warehouses, defaultPoId, receipt }: GRFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [poId, setPoId] = useState(defaultPoId ? String(defaultPoId) : "")
  const [warehouseId, setWarehouseId] = useState("")

  const selectedPO = purchaseOrders.find((po) => po.id === Number(poId))

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.append("purchaseOrderId", poId)
        formData.append("warehouseId", warehouseId)
        formData.append("date", new Date().toISOString().split("T")[0])
        // Auto-receive all items from PO
        if (selectedPO) {
          const items = selectedPO.items.map((item: any) => ({
            itemId: item.itemId,
            qty: Number(item.qty) - Number(item.receivedQty || 0),
            unitCost: Number(item.unitPrice),
          }))
          formData.append("items", JSON.stringify(items))
        }
        receipt?.id ? await updateGoodsReceipt(receipt.id, formData) : await createGoodsReceipt(formData)
        showSuccess(receipt?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/purchase/goods-receipts")
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
          <ComboBox selectedKey={poId || null} onSelectionChange={(key) => setPoId(key ? String(key) : "")} className="w-full" isRequired>
            <Label>Purchase Order *</Label>
            <ComboBox.InputGroup><Input placeholder="Cari purchase order..." /><ComboBox.Trigger /></ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {purchaseOrders.map((po) => (
                  <ListBox.Item key={po.id} id={String(po.id)} textValue={`${po.documentNo} - ${po.vendor.name}`}>{po.documentNo} - {po.vendor.name}</ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>
        <div className="flex flex-col gap-1.5">
          <ComboBox selectedKey={warehouseId || null} onSelectionChange={(key) => setWarehouseId(key ? String(key) : "")} className="w-full" isRequired>
            <Label>Gudang Tujuan *</Label>
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

      {selectedPO && (
        <div style={{ marginTop: "24px" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: "1rem" }}>Items dari PO</h3>
          <table className="w-full border-collapse" style={{ fontSize: "0.8125rem" }}>
            <thead><tr><th>Item</th><th>Qty Ordered</th><th>Qty Received</th><th>Sisa</th></tr></thead>
            <tbody>
              {selectedPO.items.map((item: any) => (
                <tr key={item.id}>
                  <td>{item.item?.name || `Item #${item.itemId}`}</td>
                  <td className="text-right">{Number(item.qty)}</td>
                  <td className="text-right">{Number(item.receivedQty || 0)}</td>
                  <td className="text-right font-medium">{Number(item.qty) - Number(item.receivedQty || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending || !poId || !warehouseId} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">
          {isPending ? "Memproses..." : "Terima Barang"}
        </button>
      </div>
    </form>
  )
}
