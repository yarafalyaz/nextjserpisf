"use client"

import { Button } from "@/components/ui/page-header"


import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateSalesInvoice } from "@/actions/sales.actions"
import { CurrencyInput } from "@/components/ui/currency-input"
import { showSuccess, showError } from "@/lib/utils/toast"
import { formatCurrency } from "@/lib/utils/format"

interface InvoiceItem {
  id?: number
  itemId: number | null
  description?: string | null
  qty: number
  unitPrice: number
  discount: number
  total: number
}

interface InvoiceItemsEditorProps {
  invoiceId: number
  customerId: number
  salesOrderId?: number | null
  quotationId?: number | null
  date: string
  dueDate?: string | null
  taxRate: number
  discountTotal: number
  items: InvoiceItem[]
  availableItems: Array<{ id: number; name: string; sku: string; price?: number }>
  paidAmount: number
  editable: boolean
}

export function InvoiceItemsEditor({
  invoiceId,
  customerId,
  salesOrderId,
  quotationId,
  date,
  dueDate,
  taxRate,
  discountTotal,
  items: initialItems,
  availableItems,
  paidAmount,
  editable,
}: InvoiceItemsEditorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [items, setItems] = useState<InvoiceItem[]>(initialItems.length > 0 ? initialItems : [])
  const [editing, setEditing] = useState(false)
  const [discount, setDiscount] = useState(discountTotal)
  const [tax, setTax] = useState(taxRate)

  const subtotal = items.reduce((sum, item) => sum + item.total, 0)
  const taxAmount = Math.round((subtotal - discount) * tax / 100)
  const grandTotal = subtotal - discount + taxAmount
  const sisa = grandTotal - paidAmount

  function addItem() {
    setItems([...items, { itemId: null, description: "", qty: 1, unitPrice: 0, discount: 0, total: 0 }])
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index))
  }

  function updateItem(index: number, field: keyof InvoiceItem, value: string | number) {
    const updated = [...items]
    const item = { ...updated[index] }

    if (field === "itemId") {
      const selectedItem = availableItems.find((i) => i.id === Number(value))
      item.itemId = Number(value)
      item.description = selectedItem?.name ?? ""
      if (selectedItem?.price) item.unitPrice = selectedItem.price
    } else if (field === "qty") {
      item.qty = Number(value) || 0
    } else if (field === "unitPrice") {
      item.unitPrice = Number(value) || 0
    } else if (field === "discount") {
      item.discount = Number(value) || 0
    }

    item.total = (item.qty * item.unitPrice) - item.discount
    updated[index] = item
    setItems(updated)
  }

  function handleSave() {
    if (items.length === 0) {
      showError("Minimal 1 item harus ada")
      return
    }
    if (items.some((item) => !item.itemId || item.qty <= 0)) {
      showError("Semua item harus memiliki produk dan qty > 0")
      return
    }

    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.append("customerId", String(customerId))
        if (salesOrderId) formData.append("salesOrderId", String(salesOrderId))
        if (quotationId) formData.append("quotationId", String(quotationId))
        formData.append("date", date)
        if (dueDate) formData.append("dueDate", dueDate)
        formData.append("taxRate", String(tax))
        formData.append("discount", String(discount))
        formData.append("items", JSON.stringify(items.map((item) => ({
          itemId: item.itemId,
          qty: item.qty,
          unitPrice: item.unitPrice,
          discount: item.discount,
        }))))

        const result = await updateSalesInvoice(invoiceId, formData)
        if (result.success) {
          showSuccess("Items berhasil diupdate")
          setEditing(false)
          router.refresh()
        }
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan")
      }
    })
  }

  if (!editing) {
    return (
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Barang</h2>
          {editable && (
            <Button
              type="button"
              onPress={() => setEditing(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary-hover transition-all"
            >
              ✏️ Edit Items
            </Button>
          )}
        </div>
        <div className="p-4 px-5 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-default">
                <th className="text-left py-2 px-2 text-xs font-medium text-muted uppercase">Item</th>
                <th className="text-right py-2 px-2 text-xs font-medium text-muted uppercase">Qty</th>
                <th className="text-right py-2 px-2 text-xs font-medium text-muted uppercase">Harga</th>
                <th className="text-right py-2 px-2 text-xs font-medium text-muted uppercase">Diskon</th>
                <th className="text-right py-2 px-2 text-xs font-medium text-muted uppercase">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} className="border-b border-default/50">
                  <td className="py-2 px-2">{item.description || `Item #${item.itemId}`}</td>
                  <td className="text-right py-2 px-2">{item.qty}</td>
                  <td className="text-right py-2 px-2">{formatCurrency(item.unitPrice)}</td>
                  <td className="text-right py-2 px-2">{formatCurrency(item.discount)}</td>
                  <td className="text-right py-2 px-2">{formatCurrency(item.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={4} className="text-right py-1 px-2 font-medium">Subtotal</td><td className="text-right py-1 px-2 font-medium">{formatCurrency(subtotal)}</td></tr>
              {discount > 0 && <tr><td colSpan={4} className="text-right py-1 px-2">Diskon</td><td className="text-right py-1 px-2">-{formatCurrency(discount)}</td></tr>}
              {taxAmount > 0 && <tr><td colSpan={4} className="text-right py-1 px-2">Pajak ({tax}%)</td><td className="text-right py-1 px-2">{formatCurrency(taxAmount)}</td></tr>}
              <tr><td colSpan={4} className="text-right py-1 px-2 font-bold">Grand Total</td><td className="text-right py-1 px-2 font-bold">{formatCurrency(grandTotal)}</td></tr>
              <tr><td colSpan={4} className="text-right py-1 px-2 text-success">Terbayar</td><td className="text-right py-1 px-2 text-success">{formatCurrency(paidAmount)}</td></tr>
              <tr><td colSpan={4} className="text-right py-1 px-2 text-danger font-bold">Sisa</td><td className="text-right py-1 px-2 text-danger font-bold">{formatCurrency(sisa)}</td></tr>
            </tfoot>
          </table>
        </div>
      </div>
    )
  }

  // Edit mode
  return (
    <div className="bg-surface rounded-xl border border-primary/30 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-4 px-5 border-b border-default bg-primary/5">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">✏️ Edit Items Invoice</h2>
        <div className="flex gap-2">
          <Button
            type="button"
            onPress={() => { setItems(initialItems); setEditing(false) }}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all"
          >
            Batal
          </Button>
          <Button
            type="button"
            onPress={handleSave}
            isDisabled={isPending}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary-hover transition-all"
          >
            {isPending ? "Menyimpan..." : "💾 Simpan"}
          </Button>
        </div>
      </div>
      <div className="p-4 px-5 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-default">
              <th className="text-left py-2 px-1 text-xs font-medium text-muted uppercase w-[35%]">Item</th>
              <th className="text-right py-2 px-1 text-xs font-medium text-muted uppercase w-[10%]">Qty</th>
              <th className="text-right py-2 px-1 text-xs font-medium text-muted uppercase w-[20%]">Harga</th>
              <th className="text-right py-2 px-1 text-xs font-medium text-muted uppercase w-[15%]">Diskon</th>
              <th className="text-right py-2 px-1 text-xs font-medium text-muted uppercase w-[15%]">Total</th>
              <th className="w-[5%]"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-b border-default/50">
                <td className="py-2 px-1">
                  <select
                    value={item.itemId ?? ""}
                    onChange={(e) => updateItem(i, "itemId", e.target.value)}
                    className="form-input w-full text-sm"
                  >
                    <option value="">Pilih item...</option>
                    {availableItems.map((ai) => (
                      <option key={ai.id} value={ai.id}>{ai.name} ({ai.sku})</option>
                    ))}
                  </select>
                </td>
                <td className="py-2 px-1">
                  <input
                    type="number"
                    min={1}
                    value={item.qty}
                    onChange={(e) => updateItem(i, "qty", e.target.value)}
                    className="form-input w-full text-right text-sm"
                  />
                </td>
                <td className="py-2 px-1">
                  <CurrencyInput
                    value={item.unitPrice}
                    onChange={(v) => updateItem(i, "unitPrice", v)}
                    className="form-input w-full text-right text-sm"
                  />
                </td>
                <td className="py-2 px-1">
                  <CurrencyInput
                    value={item.discount}
                    onChange={(v) => updateItem(i, "discount", v)}
                    className="form-input w-full text-right text-sm"
                  />
                </td>
                <td className="text-right py-2 px-1 font-medium">{formatCurrency(item.total)}</td>
                <td className="py-2 px-1">
                  <Button
                    type="button"
                    onPress={() => removeItem(i)}
                    className="text-danger hover:text-danger/80 text-lg"
                    title="Hapus item"
                  >
                    ×
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <Button
          type="button"
          onPress={addItem}
          className="mt-3 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-dashed border-default text-muted hover:border-primary hover:text-primary transition-all"
        >
          + Tambah Item
        </Button>

        {/* Summary */}
        <div className="mt-4 pt-4 border-t border-default flex flex-col items-end gap-2">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted">Diskon Total:</span>
            <CurrencyInput value={discount} onChange={setDiscount} className="form-input w-32 text-right text-sm" />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted">Pajak (%):</span>
            <input type="number" min={0} max={100} step={0.5} value={tax} onChange={(e) => setTax(Number(e.target.value))} className="form-input w-20 text-right text-sm" />
          </div>
          <div className="flex items-center gap-3 text-sm font-bold">
            <span>Grand Total:</span>
            <span>{formatCurrency(grandTotal)}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-success">
            <span>Terbayar:</span>
            <span>{formatCurrency(paidAmount)}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-danger font-bold">
            <span>Sisa:</span>
            <span>{formatCurrency(sisa)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
