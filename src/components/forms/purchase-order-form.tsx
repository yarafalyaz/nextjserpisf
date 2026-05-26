// @ts-nocheck
"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { purchaseOrderSchema, type PurchaseOrderInput } from "@/lib/validators"
import { createPurchaseOrder, updatePurchaseOrder } from "@/actions/purchase.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { TextArea, Label, ComboBox, Input, ListBox } from "@heroui/react"

interface PurchaseOrderFormProps {
  vendors: { id: number; name: string
}[]
  order?: any
  items: { id: number; sku: string; name: string; cost: string; unitOfMeasure: string }[]
  defaultPrId?: number
}

interface POItem {
  itemId: number
  qty: number
  unitPrice: number
  discount: number
}

export function PurchaseOrderForm({ vendors, items, defaultPrId, order }: PurchaseOrderFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [poItems, setPoItems] = useState<POItem[]>([{ itemId: 0, qty: 1, unitPrice: 0, discount: 0 }])

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm<PurchaseOrderInput>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: {
      date: new Date().toISOString().split("T")[0],
      notes: "",
      purchaseRequestId: defaultPrId,
    },
  })

  function addItem() {
    setPoItems([...poItems, { itemId: 0, qty: 1, unitPrice: 0, discount: 0 }])
  }

  function removeItem(index: number) {
    setPoItems(poItems.filter((_, i) => i !== index))
  }

  function updateItem(index: number, field: keyof POItem, value: number) {
    const updated = [...poItems]
    updated[index] = { ...updated[index], [field]: value }
    if (field === "itemId") {
      const item = items.find((i) => i.id === value)
      if (item) updated[index].unitPrice = Number(item.cost)
    }
    setPoItems(updated)
  }

  const grandTotal = poItems.reduce((sum, item) => sum + (item.qty * item.unitPrice - item.discount), 0)

  function onSubmit(data: PurchaseOrderInput) {
    startTransition(async () => {
      try {
        const formData = new FormData()
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined && value !== null) formData.append(key, String(value))
        })
        // Add items as JSON
        formData.append("items", JSON.stringify(poItems))
        order?.id ? await updatePurchaseOrder(order.id, formData) : await createPurchaseOrder(formData)
        showSuccess(order?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/purchase/orders")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Controller
            name="vendorId"
            control={control}
            rules={{ valueAsNumber: true }}
            render={({ field }) => (
              <ComboBox
                selectedKey={field.value ? String(field.value) : null}
                onSelectionChange={(key) => field.onChange(key ? Number(key) : undefined)}
                className="w-full"
              >
                <Label>Vendor *</Label>
                <ComboBox.InputGroup>
                  <Input placeholder="Cari vendor..." />
                  <ComboBox.Trigger />
                </ComboBox.InputGroup>
                <ComboBox.Popover>
                  <ListBox>
                    {vendors.map((v) => (
                      <ListBox.Item key={v.id} id={String(v.id)} textValue={v.name}>
                        {v.name}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </ComboBox.Popover>
              </ComboBox>
            )}
          />
          {errors.vendorId && <span className="text-xs text-danger mt-1">{errors.vendorId.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Tanggal"
            name="date"
            value={watch("date")}
            onChange={(val) => setValue("date", val)}
            required
          />
          {errors.date && <span className="text-xs text-danger mt-1">{errors.date.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Expected Delivery"
            name="expectedDate"
            value={watch("expectedDate")}
            onChange={(val) => setValue("expectedDate", val)}
          />
        </div>

        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="notes">Catatan</Label>
          <TextArea id="notes" {...register("notes")} rows={2} placeholder="Catatan PO..." />
        </div>
      </div>

      {/* Items */}
      <div style={{ marginTop: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Items</h3>
          <button type="button" onClick={addItem} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -secondary">+ Tambah Item</button>
        </div>

        <table className="w-full border-collapse" style={{ fontSize: "0.8125rem" }}>
          <thead>
            <tr>
              <th>Item</th>
              <th style={{ width: "80px" }}>Qty</th>
              <th style={{ width: "120px" }}>Harga</th>
              <th style={{ width: "100px" }}>Diskon</th>
              <th style={{ width: "120px" }}>Total</th>
              <th style={{ width: "40px" }}></th>
            </tr>
          </thead>
          <tbody>
            {poItems.map((poItem, index) => (
              <tr key={index}>
                <td>
                  <select
                    value={poItem.itemId}
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
                    value={poItem.qty}
                    onChange={(e) => updateItem(index, "qty", Number(e.target.value))}
                    className="form-input"
                    style={{ fontSize: "0.8125rem", padding: "6px 8px" }}
                    min={1}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={poItem.unitPrice}
                    onChange={(e) => updateItem(index, "unitPrice", Number(e.target.value))}
                    className="form-input"
                    style={{ fontSize: "0.8125rem", padding: "6px 8px" }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={poItem.discount}
                    onChange={(e) => updateItem(index, "discount", Number(e.target.value))}
                    className="form-input"
                    style={{ fontSize: "0.8125rem", padding: "6px 8px" }}
                  />
                </td>
                <td className="text-right">
                  Rp {(poItem.qty * poItem.unitPrice - poItem.discount).toLocaleString("id-ID")}
                </td>
                <td>
                  {poItems.length > 1 && (
                    <button type="button" onClick={() => removeItem(index)} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-default transition-all -ghost" style={{ color: "var(--color-danger)" }}>×</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="text-right"><strong>Grand Total</strong></td>
              <td className="text-right"><strong>Rp {grandTotal.toLocaleString("id-ID")}</strong></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="submit-po">
          {isPending ? "Menyimpan..." : order?.id ? "Update" : "Simpan"}
        </button>
      </div>
    </form>
  )
}
