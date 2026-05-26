// @ts-nocheck
"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { FormAttachmentUpload } from "@/components/ui/form-attachment-upload"
import { Plus, Trash2 } from "lucide-react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, ComboBox, ListBox, Label } from "@heroui/react"

interface BillItem {
  itemId: string
  qty: number
  unitPrice: number
}

interface VendorBillFormProps {
  vendors: { id: number; name: string
}[]
  bill?: any
  items: { id: number; sku: string; name: string; cost: any; unitOfMeasure: string }[]
}

export function VendorBillForm({ vendors, items, bill }: VendorBillFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [dueDate, setDueDate] = useState("")
  const [billItems, setBillItems] = useState<BillItem[]>([{ itemId: "", qty: 1, unitPrice: 0 }])

  function addItem() {
    setBillItems([...billItems, { itemId: "", qty: 1, unitPrice: 0 }])
  }

  function removeItem(index: number) {
    setBillItems(billItems.filter((_, i) => i !== index))
  }

  function updateItem(index: number, field: keyof BillItem, value: any) {
    const updated = [...billItems]
    updated[index] = { ...updated[index], [field]: value }
    if (field === "itemId" && value) {
      const item = items.find((i) => i.id === Number(value))
      if (item) updated[index].unitPrice = Number(item.cost)
    }
    setBillItems(updated)
  }

  const subtotal = billItems.reduce((sum, item) => sum + item.qty * item.unitPrice, 0)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        formData.set("subtotal", String(subtotal))
        formData.set("tax", "0")
        formData.set("grandTotal", String(subtotal))
        const { createVendorBill } = await import("@/actions/purchase.actions")
        bill?.id ? await updateVendorBill(bill.id, formData) : await createVendorBill(formData)
        showSuccess(bill?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/purchase/bills")
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
          <ComboBox name="vendorId" className="w-full" isRequired>
            <Label>Vendor *</Label>
            <ComboBox.InputGroup><Input placeholder="Cari vendor..." /><ComboBox.Trigger /></ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {vendors.map((v) => (
                  <ListBox.Item key={v.id} id={String(v.id)} textValue={v.name}>{v.name}</ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker label="Tanggal *" name="date" value={date} onChange={setDate} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker label="Jatuh Tempo" name="dueDate" value={dueDate} onChange={setDueDate} />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="notes">Catatan</Label>
          <TextArea id="notes" name="notes" rows={2} placeholder="Catatan..." defaultValue={bill?.notes ?? ""} />
        </div>
      </div>

      <div style={{ marginTop: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Item</h3>
          <button type="button" onClick={addItem} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all"><Plus size={14} /> Tambah Item</button>
        </div>
        <table className="w-full border-collapse" style={{ fontSize: "0.8125rem" }}>
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Harga Satuan</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {billItems.map((item, idx) => (
              <tr key={idx}>
                <td>
                  <select value={item.itemId} onChange={(e) => updateItem(idx, "itemId", e.target.value)} className="form-input" required>
                    <option value="">Pilih Item</option>
                    {items.map((i) => <option key={i.id} value={i.id}>{i.sku} - {i.name}</option>)}
                  </select>
                </td>
                <td><input type="number" value={item.qty} onChange={(e) => updateItem(idx, "qty", Number(e.target.value))} className="form-input" min={1} style={{ width: "80px" }} /></td>
                <td><input type="number" value={item.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", Number(e.target.value))} className="form-input" min={0} style={{ width: "120px" }} /></td>
                <td className="text-right">{(item.qty * item.unitPrice).toLocaleString("id-ID")}</td>
                <td>
                  {billItems.length > 1 && (
                    <button type="button" onClick={() => removeItem(idx)} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -ghost"><Trash2 size={14} /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="text-right"><strong>Grand Total</strong></td>
              <td className="text-right"><strong>{subtotal.toLocaleString("id-ID")}</strong></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <FormAttachmentUpload referenceType="vendor_bill" />
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">{isPending ? "Menyimpan..." : bill?.id ? "Update" : "Simpan"}</button>
      </div>
    </form>
  )
}
