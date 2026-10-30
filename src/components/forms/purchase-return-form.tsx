"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createPurchaseReturn, updatePurchaseReturn } from "@/actions/purchase.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Combobox } from "@/components/ui/combobox"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { nextItemUid } from "@/lib/utils/item-uid"
import { ReturnItemsSection, ReturnFormActions, ReturnDateAndReason, ReturnTaxNoteFields } from "@/components/forms/return-items-section"

export interface ReceiptLineOption {
  id: number
  purchaseOrderId: number
  itemId: number
  qty: number
  uom: string | null
  batchNumber: string | null
  label: string
}

interface PurchaseReturnFormProps {
  purchaseOrders: { id: number; documentNo: string
}[]
  returnData?: { id: number; purchaseOrderId: number; date: string; reason?: string | null; taxReturnNoteNumber?: string | null; taxReturnNoteDate?: string | null; items?: Array<{ itemId: number; qty: number; notes?: string; goodsReceiptItemId?: number | null }> }
  items: { id: number; sku: string; name: string }[]
  receiptLines?: ReceiptLineOption[]
}

interface ReturnItem {
  itemId: number
  qty: number
  goodsReceiptItemId?: number | null
  /** Kunci baris untuk React; dibuang sebelum dikirim ke server. */
  uid: string;
}

export function PurchaseReturnForm({ purchaseOrders, items, returnData, receiptLines = [] }: PurchaseReturnFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [date, setDate] = useState(returnData?.date ?? toLocalDateOnly(new Date()))
  const [taxReturnNoteDate, setTaxReturnNoteDate] = useState(returnData?.taxReturnNoteDate ?? "")
  const [purchaseOrderId, setPurchaseOrderId] = useState(returnData?.purchaseOrderId ? String(returnData.purchaseOrderId) : "")
  // Seed returnItems from returnData on edit so updating a return doesn't
  // silently wipe all existing line items to a single empty row.
  const [returnItems, setReturnItems] = useState<ReturnItem[]>(
    returnData?.items && returnData.items.length > 0
      ? returnData.items.map((it) => ({ itemId: it.itemId, qty: it.qty, goodsReceiptItemId: it.goodsReceiptItemId ?? null, uid: nextItemUid() }))
      : [{ itemId: 0, qty: 1, uid: nextItemUid() }],
  )

  function addItem() {
    setReturnItems([...returnItems, { itemId: 0, qty: 1, uid: nextItemUid() }])
  }

  /** Baris penerimaan asal yang cocok untuk baris retur ini (PO + item). */
  function receiptOptionsFor(row: ReturnItem): ReceiptLineOption[] {
    const poId = Number(purchaseOrderId)
    if (!poId || !row.itemId) return []
    return receiptLines.filter((l) => l.purchaseOrderId === poId && l.itemId === row.itemId)
  }

  function removeItem(index: number) {
    setReturnItems(returnItems.filter((_, i) => i !== index))
  }

  function updateItem(index: number, field: keyof ReturnItem, value: number) {
    const updated = [...returnItems]
    updated[index] = { ...updated[index], [field]: value }
    setReturnItems(updated)
  }

  function setReceiptLine(index: number, value: string) {
    const updated = [...returnItems]
    updated[index] = { ...updated[index], goodsReceiptItemId: value ? Number(value) : null }
    setReturnItems(updated)
  }

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        formData.set("date", date)
        formData.append("items", JSON.stringify(returnItems.map(({ uid: _uid, ...rest }) => rest)))
        const result = returnData?.id ? await updatePurchaseReturn(returnData.id, formData) : await createPurchaseReturn(formData)
        if (result.success) {
          showSuccess(returnData?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
          router.push("/pembelian/retur")
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
    <form onSubmit={onSubmit} aria-busy={isPending} aria-label={returnData?.id ? "Formulir ubah retur pembelian" : "Formulir tambah retur pembelian"} className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="purchaseOrderId">Pesanan Pembelian <span className="text-destructive" aria-hidden="true">*</span></Label>
          <Combobox
            id="purchaseOrderId"
            name="purchaseOrderId"
            required
            value={purchaseOrderId || null}
            onChange={(key) => setPurchaseOrderId(key ?? "")}
            placeholder="Cari pesanan pembelian..."
            options={purchaseOrders.map((po) => ({ value: String(po.id), label: po.documentNo }))}
          />
        </div>

        <ReturnDateAndReason date={date} setDate={setDate} reasonPlaceholder="Alasan pengembalian barang ke pemasok..." reasonDefault={returnData?.reason ?? ""} />

        <ReturnTaxNoteFields
          taxReturnNoteNumberDefault={returnData?.taxReturnNoteNumber ?? ""}
          taxReturnNoteDate={taxReturnNoteDate}
          setTaxReturnNoteDate={setTaxReturnNoteDate}
        />
      </div>

      <ReturnItemsSection
        items={items}
        returnItems={returnItems}
        addItem={addItem}
        removeItem={removeItem}
        updateItem={(index, field, value) => {
          if (field === "itemId" || field === "qty") updateItem(index, field, value as number)
        }}
        extraHeaders={<th style={{ minWidth: "190px" }}>Penerimaan Asal</th>}
        renderExtraCells={(row, index) => {
          const options = receiptOptionsFor(row)
          return (
            <td>
              <select
                aria-label={`Penerimaan asal baris ${index + 1}`}
                value={row.goodsReceiptItemId ? String(row.goodsReceiptItemId) : ""}
                disabled={!row.itemId || options.length === 0}
                onChange={(e) => setReceiptLine(index, e.target.value)}
                className="form-input"
              >
                <option value="">Otomatis (terbaru)</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </td>
          )
        }}
      />

      <ReturnFormActions isPending={isPending} isEdit={!!returnData?.id} submitId="submit-purchase-return" onCancel={() => router.back()} />
    </form>
  )
}
