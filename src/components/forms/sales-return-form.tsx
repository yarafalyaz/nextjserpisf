"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createSalesReturn, updateSalesReturn } from "@/actions/sales.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, ComboBox, ListBox, Label } from "@heroui/react"
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
          showSuccess(returnData?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
          router.push("/sales/returns")
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
          <ComboBox name="salesInvoiceId" className="w-full">
            <Label>Invoice (Opsional)</Label>
            <ComboBox.InputGroup>
              <Input placeholder="Cari invoice..." />
              <ComboBox.Trigger />
            </ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {invoices.map((inv) => (
                  <ListBox.Item key={inv.id} id={String(inv.id)} textValue={inv.documentNo}>{inv.documentNo}</ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>

        <div className="flex flex-col gap-1.5">
          <ComboBox name="customerId" className="w-full" isRequired>
            <Label>Customer</Label>
            <ComboBox.InputGroup>
              <Input placeholder="Cari customer..." />
              <ComboBox.Trigger />
            </ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {customers.map((c) => (
                  <ListBox.Item key={c.id} id={String(c.id)} textValue={c.name}>{c.name}</ListBox.Item>
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
          <TextArea id="reason" name="reason" rows={3} placeholder="Alasan pengembalian barang..." defaultValue={returnData?.reason ?? ""} />
        </div>
      </div>

      {/* Items */}
      <div style={{ marginTop: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Item Retur</h3>
          <Button onClick={addItem} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -secondary">+ Tambah Item</Button>
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
                    onChange={(e) => updateItem(index, "itemId", (Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0))}
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
                    onChange={(e) => updateItem(index, "qty", (Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0))}
                    className="form-input"
                    style={{ fontSize: "0.8125rem", padding: "6px 8px" }}
                    min={1}
                  />
                </td>
                <td>
                  {returnItems.length > 1 && (
                    <Button onClick={() => removeItem(index)} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -ghost" style={{ color: "var(--color-danger)" }}>×</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button onClick={() => router.back()} >Batal</Button>
        <Button disabled={isPending}  id="submit-sales-return">
          {isPending ? "Menyimpan..." : returnData?.id ? "Update" : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
