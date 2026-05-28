"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createGoodsReceipt, updateGoodsReceipt } from "@/actions/purchase.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, ComboBox, ListBox, Label } from "@heroui/react"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/page-header"

interface GRFormProps {
  purchaseOrders: Array<{ id: number; documentNo: string; vendor?: { name: string }; items: Array<{ id: number; itemId: number; qty: number; unitPrice: number; receivedQty?: number; item: { name: string; sku: string } }> }>
  warehouses: { id: number; name: string }[]
  receipt?: { id: number; purchaseOrderId: number; date: string; notes?: string | null }
  defaultPoId?: number
}

interface GRItemRow {
  itemId: number
  qty: number
  unitCost: number
  qtyOrdered: number
  warehouseId: string
}

export function GoodsReceiptForm({ purchaseOrders, warehouses, defaultPoId, receipt }: GRFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [poId, setPoId] = useState(defaultPoId ? String(defaultPoId) : "")
  const [warehouseId, setWarehouseId] = useState("")
  const [grItems, setGrItems] = useState<GRItemRow[]>([])

  const selectedPO = purchaseOrders.find((po) => po.id === Number(poId))

  function handlePoChange(key: string | null) {
    const newPoId = key ? String(key) : ""
    setPoId(newPoId)
    const po = purchaseOrders.find((p) => p.id === Number(newPoId))
    if (po) {
      setGrItems(
        po.items.map((item) => ({
          itemId: item.itemId,
          qty: Number(item.qty) - Number(item.receivedQty || 0),
          unitCost: Number(item.unitPrice),
          qtyOrdered: Number(item.qty),
          warehouseId: "",
        }))
      )
    } else {
      setGrItems([])
    }
  }

  function updateItemWarehouse(index: number, value: string) {
    const updated = [...grItems]
    updated[index] = { ...updated[index], warehouseId: value }
    setGrItems(updated)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.append("purchaseOrderId", poId)
        formData.append("warehouseId", warehouseId)
        formData.append("date", new Date().toISOString().split("T")[0])
        const items = grItems.map((item) => ({
          itemId: item.itemId,
          qty: item.qty,
          unitCost: item.unitCost,
          warehouseId: item.warehouseId ? Number(item.warehouseId) : null,
        }))
        formData.append("items", JSON.stringify(items))
        receipt?.id ? await updateGoodsReceipt(receipt.id, formData) : await createGoodsReceipt(formData)
        showSuccess(receipt?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/pembelian/penerimaan")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit}>
      <FormCard>
        <FormSection title="Informasi Umum">
          <div className="flex flex-col gap-1.5">
            <ComboBox selectedKey={poId || null} onSelectionChange={(key) => handlePoChange(key ? String(key) : null)} className="w-full" isRequired>
              <Label>Pesanan Pembelian *</Label>
              <ComboBox.InputGroup><Input placeholder="Cari purchase order..." /><ComboBox.Trigger /></ComboBox.InputGroup>
              <ComboBox.Popover>
                <ListBox>
                  {purchaseOrders.map((po) => (
                    <ListBox.Item key={po.id} id={String(po.id)} textValue={`${po.documentNo} - ${po.vendor?.name ?? ""}`}>{po.documentNo} - {po.vendor?.name ?? ""}</ListBox.Item>
                  ))}
                </ListBox>
              </ComboBox.Popover>
            </ComboBox>
          </div>
          <div className="flex flex-col gap-1.5">
            <ComboBox selectedKey={warehouseId || null} onSelectionChange={(key) => setWarehouseId(key ? String(key) : "")} className="w-full" isRequired>
              <Label>Gudang Tujuan (Default) *</Label>
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
        </FormSection>

        {selectedPO && grItems.length > 0 && (
          <FormSection title="Item" columns={1}>
            <table className="w-full border-collapse" style={{ fontSize: "0.8125rem" }}>
              <thead><tr><th>Item</th><th>Qty Ordered</th><th>Sisa</th><th>Gudang (per item)</th></tr></thead>
              <tbody>
                {selectedPO.items.map((item, index) => (
                  <tr key={item.id}>
                    <td>{item.item?.name || `Item #${item.itemId}`}</td>
                    <td className="text-right">{Number(item.qty)}</td>
                    <td className="text-right font-medium">{Number(item.qty) - Number(item.receivedQty || 0)}</td>
                    <td>
                      <select
                        value={grItems[index]?.warehouseId || ""}
                        onChange={(e) => updateItemWarehouse(index, e.target.value)}
                        className="form-input"
                        style={{ fontSize: "0.8125rem", padding: "6px" }}
                      >
                        <option value="">— Default —</option>
                        {warehouses.map((w) => (
                          <option key={w.id} value={String(w.id)}>{w.name}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </FormSection>
        )}

        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending || !poId || !warehouseId}>
            {isPending ? "Memproses..." : "Terima Barang"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
