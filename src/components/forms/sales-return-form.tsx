"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createSalesReturn, updateSalesReturn } from "@/actions/sales.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Combobox } from "@/components/ui/combobox"
import { QuickAddSelect } from "@/components/ui/quick-add-select"
import { QUICK_ADD } from "@/lib/quick-add/registry"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { nextItemUid } from "@/lib/utils/item-uid"
import { ReturnItemsSection, ReturnFormActions, ReturnDateAndReason, ReturnTaxNoteFields } from "@/components/forms/return-items-section"

interface SalesReturnFormProps {
  invoices: { id: number; documentNo: string
}[]
  returnData?: { id: number; customerId?: number; salesInvoiceId: number; date: string; reason?: string | null; taxReturnNoteNumber?: string | null; taxReturnNoteDate?: string | null; items?: Array<{ itemId: number; qty: number; notes?: string; serialNumbers?: string[]; batchNumbers?: string[] }> }
  customers: { id: number; name: string }[]
  items: { id: number; sku: string; name: string }[]
}

interface ReturnItem {
  itemId: number
  qty: number
  /** Nomor seri/batch yang benar-benar kembali (koma-pisah). Wajib bila item tracked. */
  serialNumbers: string
  batchNumbers: string
  /** Kunci baris untuk React; dibuang sebelum dikirim ke server. */
  uid: string;
}

export function SalesReturnForm({ invoices, customers, items, returnData }: SalesReturnFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [date, setDate] = useState(returnData?.date ?? toLocalDateOnly(new Date()))
  const [taxReturnNoteDate, setTaxReturnNoteDate] = useState(returnData?.taxReturnNoteDate ?? "")
  const [salesInvoiceId, setSalesInvoiceId] = useState(returnData?.salesInvoiceId ? String(returnData.salesInvoiceId) : "")
  const [customerId, setCustomerId] = useState(returnData?.customerId ? String(returnData.customerId) : "")
  const [customerOptions, setCustomerOptions] = useState(customers)
  // Seed returnItems from returnData on edit so updating a return doesn't
  // silently wipe all existing line items to a single empty row.
  const [returnItems, setReturnItems] = useState<ReturnItem[]>(
    returnData?.items && returnData.items.length > 0
      ? returnData.items.map((it) => ({
          itemId: it.itemId,
          qty: it.qty,
          serialNumbers: (it.serialNumbers ?? []).join(", "),
          batchNumbers: (it.batchNumbers ?? []).join(", "),
          uid: nextItemUid(),
        }))
      : [{ itemId: 0, qty: 1, serialNumbers: "", batchNumbers: "", uid: nextItemUid() }],
  )

  function addItem() {
    setReturnItems([...returnItems, { itemId: 0, qty: 1, serialNumbers: "", batchNumbers: "", uid: nextItemUid() }])
  }

  function removeItem(index: number) {
    setReturnItems(returnItems.filter((_, i) => i !== index))
  }

  function updateItem(index: number, field: "itemId" | "qty" | "serialNumbers" | "batchNumbers", value: number | string) {
    const updated = [...returnItems]
    updated[index] = { ...updated[index], [field]: value } as ReturnItem
    setReturnItems(updated)
  }

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        formData.set("date", date)
        formData.append("items", JSON.stringify(returnItems.map(({ uid: _uid, ...rest }) => rest)))
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
    <form onSubmit={onSubmit} aria-busy={isPending} aria-label={returnData?.id ? "Formulir ubah retur penjualan" : "Formulir tambah retur penjualan"} className="bg-surface rounded-xl border border-default shadow-sm p-6">
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
          <Label htmlFor="customerId">Pelanggan <span className="text-destructive" aria-hidden="true">*</span></Label>
          <QuickAddSelect
            id="customerId"
            name="customerId"
            required
            value={customerId || null}
            onChange={(key) => setCustomerId(key ?? "")}
            placeholder="Cari pelanggan..."
            options={customerOptions.map((c) => ({ value: String(c.id), label: c.name }))}
            title={QUICK_ADD.customer.title}
            fields={QUICK_ADD.customer.fields}
            action={QUICK_ADD.customer.action}
            onCreated={(created) => {
              setCustomerOptions((prev) => [...prev, { id: created.id, name: created.label }])
              setCustomerId(String(created.id))
            }}
          />
        </div>

        <ReturnDateAndReason date={date} setDate={setDate} reasonPlaceholder="Alasan pengembalian barang..." reasonDefault={returnData?.reason ?? ""} />

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
        updateItem={updateItem}
        extraHeaders={<><th>Serial (koma-pisah)</th><th>Batch (koma-pisah)</th></>}
        renderExtraCells={(ri, index) => (
          <>
            <td>
              <input
                type="text"
                aria-label={`Serial baris ${index + 1}`}
                value={ri.serialNumbers}
                onChange={(e) => updateItem(index, "serialNumbers", e.target.value)}
                placeholder="SN-001, SN-002"
                className="form-input"
                style={{ fontSize: "0.8125rem", padding: "6px 8px" }}
              />
            </td>
            <td>
              <input
                type="text"
                aria-label={`Batch baris ${index + 1}`}
                value={ri.batchNumbers}
                onChange={(e) => updateItem(index, "batchNumbers", e.target.value)}
                placeholder="LOT-1"
                className="form-input"
                style={{ fontSize: "0.8125rem", padding: "6px 8px" }}
              />
            </td>
          </>
        )}
      />

      <ReturnFormActions isPending={isPending} isEdit={!!returnData?.id} submitId="submit-sales-return" onCancel={() => router.back()} />
    </form>
  )
}
