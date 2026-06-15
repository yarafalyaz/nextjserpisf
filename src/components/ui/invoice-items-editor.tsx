"use client"

import { Button } from "@/components/ui/button"


import { useState, useTransition, Fragment } from "react"
import { useRouter } from "next/navigation"
import { updateSalesInvoice } from "@/actions/sales.actions"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Combobox } from "@/components/ui/combobox"
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
  uom?: string | null
  serialNumbers?: string[]
}

interface AvailableItem {
  id: number
  name: string
  sku: string
  price?: number
  unitOfMeasure?: string
  trackSerial?: boolean
  uomConversions?: Array<{ code: string; factorToBase: number }>
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
  availableItems: AvailableItem[]
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
    setItems([...items, { itemId: null, description: "", qty: 1, unitPrice: 0, discount: 0, total: 0, uom: null, serialNumbers: [] }])
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
      // Reset satuan ke satuan dasar item & kosongkan serial saat ganti item
      item.uom = selectedItem?.unitOfMeasure ?? null
      item.serialNumbers = []
    } else if (field === "qty") {
      item.qty = Number(value) || 0
    } else if (field === "unitPrice") {
      item.unitPrice = Number(value) || 0
    } else if (field === "discount") {
      item.discount = Number(value) || 0
    } else if (field === "uom") {
      item.uom = String(value)
    }

    item.total = (item.qty * item.unitPrice) - item.discount
    updated[index] = item
    setItems(updated)
  }

  function updateItemSerialNumbers(index: number, raw: string) {
    const updated = [...items]
    const item = { ...updated[index] }
    item.serialNumbers = raw
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
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
        formData.append("items", JSON.stringify(items.map((item) => {
          const payload: {
            itemId: number | null
            qty: number
            unitPrice: number
            discount: number
            uom?: string
            serialNumbers?: string[]
          } = {
            itemId: item.itemId,
            qty: item.qty,
            unitPrice: item.unitPrice,
            discount: item.discount,
          }
          if (item.uom) payload.uom = item.uom
          if (item.serialNumbers && item.serialNumbers.length > 0) payload.serialNumbers = item.serialNumbers
          return payload
        })))

        const result = await updateSalesInvoice(invoiceId, formData)
        if (result.success) {
          showSuccess("Item berhasil diperbarui")
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
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary-hover transition-all"
            >
              Ubah Item
            </Button>
          )}
        </div>
        <div className="p-4 px-5 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-default">
                <th scope="col" className="text-left py-2 px-2 text-xs font-medium text-muted-foreground uppercase">Item</th>
                <th scope="col" className="text-right py-2 px-2 text-xs font-medium text-muted-foreground uppercase">Jml</th>
                <th scope="col" className="text-right py-2 px-2 text-xs font-medium text-muted-foreground uppercase">Harga</th>
                <th scope="col" className="text-right py-2 px-2 text-xs font-medium text-muted-foreground uppercase">Diskon</th>
                <th scope="col" className="text-right py-2 px-2 text-xs font-medium text-muted-foreground uppercase">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} className="border-b border-default/50">
                  <td className="py-2 px-2">{item.description || `Item #${item.itemId}`}</td>
                  <td className="text-right py-2 px-2">{item.qty}{item.uom ? ` ${item.uom}` : ""}</td>
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
              <tr><td colSpan={4} className="text-right py-1 px-2 font-bold">Total Keseluruhan</td><td className="text-right py-1 px-2 font-bold">{formatCurrency(grandTotal)}</td></tr>
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
        <h2 className="text-[0.9375rem] font-semibold text-foreground">Ubah Item Faktur</h2>
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
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary-hover transition-all"
          >
            {isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </div>
      <div className="p-4 px-5 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-default">
              <th scope="col" className="text-left py-2 px-1 text-xs font-medium text-muted-foreground uppercase w-[35%]">Item</th>
              <th scope="col" className="text-right py-2 px-1 text-xs font-medium text-muted-foreground uppercase w-[10%]">Jml</th>
              <th scope="col" className="text-right py-2 px-1 text-xs font-medium text-muted-foreground uppercase w-[20%]">Harga</th>
              <th scope="col" className="text-right py-2 px-1 text-xs font-medium text-muted-foreground uppercase w-[15%]">Diskon</th>
              <th scope="col" className="text-right py-2 px-1 text-xs font-medium text-muted-foreground uppercase w-[15%]">Total</th>
              <th scope="col" className="w-[5%]"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const selectedMeta = availableItems.find((ai) => ai.id === item.itemId)
              const conversions = selectedMeta?.uomConversions ?? []
              const baseUom = selectedMeta?.unitOfMeasure
              const uomOptions = baseUom ? [baseUom, ...conversions.map((c) => c.code)] : []
              const showUomSelect = uomOptions.length > 1
              const tracksSerial = selectedMeta?.trackSerial === true
              const serialText = (item.serialNumbers ?? []).join("\n")
              const serialCount = item.serialNumbers?.length ?? 0
              return (
              <Fragment key={i}>
              <tr className="border-b border-default/50">
                <td className="py-2 px-1 align-top">
                  <Combobox
                    options={availableItems.map((ai) => ({ value: String(ai.id), label: `${ai.name} (${ai.sku})` }))}
                    value={item.itemId ? String(item.itemId) : null}
                    onChange={(key) => updateItem(i, "itemId", key ?? "")}
                    placeholder="Cari item..."
                    className="w-full"
                  />
                  {item.itemId && baseUom && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Satuan:</span>
                      {showUomSelect ? (
                        <Combobox
                          options={uomOptions.map((code) => ({ value: code, label: code }))}
                          value={item.uom ?? baseUom}
                          onChange={(key) => updateItem(i, "uom", key ?? "")}
                          placeholder="Cari satuan..."
                          className="w-28"
                        />
                      ) : (
                        <span className="text-xs font-medium text-foreground">{item.uom ?? baseUom}</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="py-2 px-1 align-top">
                  <label className="sr-only" htmlFor={`invoice-item-qty-${i}`}>Jumlah item baris {i + 1}</label>
                  <input
                    id={`invoice-item-qty-${i}`}
                    type="number"
                    min={1}
                    value={item.qty}
                    onChange={(e) => updateItem(i, "qty", e.target.value)}
                    className="form-input w-full text-right text-sm"
                  />
                </td>
                <td className="py-2 px-1 align-top">
                  <CurrencyInput
                    value={item.unitPrice}
                    onChange={(v) => updateItem(i, "unitPrice", v)}
                    className="form-input w-full text-right text-sm"
                  />
                </td>
                <td className="py-2 px-1 align-top">
                  <CurrencyInput
                    value={item.discount}
                    onChange={(v) => updateItem(i, "discount", v)}
                    className="form-input w-full text-right text-sm"
                  />
                </td>
                <td className="text-right py-2 px-1 font-medium align-top">{formatCurrency(item.total)}</td>
                <td className="py-2 px-1 align-top">
                  <Button
                    type="button"
                    onPress={() => removeItem(i)}
                    className="text-danger hover:text-danger/80 text-lg"
                    title="Hapus item"
                    aria-label={`Hapus item baris ${i + 1}`}
                  >
                    ×
                  </Button>
                </td>
              </tr>
              {item.itemId && tracksSerial && (
                <tr className="border-b border-default/50">
                  <td colSpan={6} className="py-2 px-1">
                    <label className="block text-xs font-medium text-muted-foreground mb-1" htmlFor={`invoice-item-serial-${i}`}>
                      Nomor Seri (satu per baris)
                    </label>
                    <textarea
                      id={`invoice-item-serial-${i}`}
                      value={serialText}
                      onChange={(e) => updateItemSerialNumbers(i, e.target.value)}
                      rows={Math.max(2, Math.min(serialCount + 1, 6))}
                      placeholder="Kosongkan untuk pemilihan FIFO otomatis"
                      className="form-input w-full text-sm font-mono"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {serialCount} nomor seri terisi
                      {item.qty > 0 ? ` (disarankan ${item.qty} sesuai qty)` : ""}
                      {serialCount > 0 && serialCount !== item.qty ? " — jumlah belum sama dengan qty" : ""}
                    </p>
                  </td>
                </tr>
              )}
              </Fragment>
              )
            })}
          </tbody>
        </table>

        <Button
          type="button"
          onPress={addItem}
          className="mt-3 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-dashed border-default text-muted-foreground hover:border-primary hover:text-primary transition-all"
        >
          + Tambah Item
        </Button>

        {/* Summary */}
        <div className="mt-4 pt-4 border-t border-default flex flex-col items-end gap-2">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">Diskon Total:</span>
            <CurrencyInput value={discount} onChange={setDiscount} className="form-input w-32 text-right text-sm" />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">Pajak (%):</span>
            <label className="sr-only" htmlFor="invoice-tax-rate">Pajak persen</label>
            <input id="invoice-tax-rate" type="number" min={0} max={100} step={0.5} value={tax} onChange={(e) => setTax(Number(e.target.value))} className="form-input w-20 text-right text-sm" />
          </div>
          <div className="flex items-center gap-3 text-sm font-bold">
            <span>Total Keseluruhan:</span>
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
