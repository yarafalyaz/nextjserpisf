"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createSalesReturn, updateSalesReturn } from "@/actions/sales.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { Button } from "@/components/ui/page-header"

interface SalesReturnFormProps {
  invoices: { id: number; documentNo: string
}[]
  returnData?: { id: number; salesInvoiceId: number; date: string; reason?: string | null; items?: Array<{ itemId: number; qty: number; notes?: string }> }
  customers: { id: number; name: string }[]
  items: { id: number; sku: string; name: string }[]
}

interface ReturnItem {
  itemId: number
  qty: number
}

export function SalesReturnForm({ invoices, customers, items, returnData }: SalesReturnFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [salesInvoiceId, setSalesInvoiceId] = useState(returnData?.salesInvoiceId ? String(returnData.salesInvoiceId) : "")
  const [customerId, setCustomerId] = useState("")
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
        const result = returnData?.id ? await updateSalesReturn(returnData.id, formData) : await createSalesReturn(formData)
        if (result.success) {
          showSuccess(returnData?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
          router.push("/penjualan/retur")
          router.refresh()
        } else {
          showError(result.error || "Gagal menyimpan data")
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
          <Label htmlFor="salesInvoiceId">Faktur (Opsional)</Label>
          <Combobox
            id="salesInvoiceId"
            name="salesInvoiceId"
            value={salesInvoiceId || null}
            onChange={(key) => setSalesInvoiceId(key ?? "")}
            placeholder="Cari faktur..."
            options={invoices.map((inv) => ({ value: String(inv.id), label: inv.documentNo }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customerId">Pelanggan</Label>
          <Combobox
            id="customerId"
            name="customerId"
            value={customerId || null}
            onChange={(key) => setCustomerId(key ?? "")}
            placeholder="Cari pelanggan..."
            options={customers.map((c) => ({ value: String(c.id), label: c.name }))}
          />
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
          <Textarea id="reason" name="reason" rows={3} placeholder="Alasan pengembalian barang..." defaultValue={returnData?.reason ?? ""} />
        </div>
      </div>

      {/* Items */}
      <div style={{ marginTop: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Item Retur</h3>
          <Button type="button" onPress={addItem} variant="secondary" size="sm">+ Tambah Item</Button>
        </div>

        <table className="w-full border-collapse" style={{ fontSize: "0.8125rem" }}>
          <thead>
            <tr>
              <th>Item</th>
              <th style={{ width: "100px" }}>Jml</th>
              <th style={{ width: "40px" }}></th>
            </tr>
          </thead>
          <tbody>
            {returnItems.map((ri, index) => (
              <tr key={index}>
                <td>
                  <Combobox
                    options={items.map((item) => ({ value: String(item.id), label: `${item.sku} - ${item.name}` }))}
                    value={ri.itemId ? String(ri.itemId) : null}
                    onChange={(key) => updateItem(index, "itemId", key ? Number(key) : 0)}
                    placeholder="Cari item..."
                    className="w-full"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    onChange={(e) => updateItem(index, "qty", (Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0))}
                    className="form-input"
                    style={{ fontSize: "0.8125rem", padding: "6px 8px" }}
                  />
                </td>
                <td>
                  {returnItems.length > 1 && (
                    <Button type="button" onPress={() => removeItem(index)} variant="danger-soft" size="sm">×</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" isDisabled={isPending}  id="submit-sales-return">
          {isPending ? "Menyimpan..." : returnData?.id ? "Perbarui" : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
