"use client"

import type { ReactNode } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { Button } from "@/components/ui/button"
import { Plus, Trash2 } from "@/components/ui/fontawesome-icons"

/**
 * Bagian bersama form retur penjualan/pembelian: blok item (tabel baris)
 * dan baris tombol simpan. Kepala form (faktur/PO, pelanggan/vendor,
 * tanggal, alasan) tetap di masing-masing form karena field-nya beda;
 * kolom ekstra per baris (mis. Serial/Batch di retur penjualan) masuk
 * lewat `extraHeaders` + `renderExtraCells`.
 */
export interface ReturnItemsSectionProps<TItem> {
  items: { id: number; sku: string; name: string }[]
  returnItems: TItem[]
  addItem: () => void
  removeItem: (index: number) => void
  updateItem: (
    index: number,
    field: "itemId" | "qty" | "serialNumbers" | "batchNumbers" | "goodsReceiptItemId",
    value: number | string,
  ) => void
  extraHeaders?: ReactNode
  renderExtraCells?: (item: TItem, index: number) => ReactNode
}

export function ReturnItemsSection<TItem extends { itemId: number; qty: number; uid: string }>({
  items,
  returnItems,
  addItem,
  removeItem,
  updateItem,
  extraHeaders,
  renderExtraCells,
}: ReturnItemsSectionProps<TItem>) {
  return (
    <div style={{ marginTop: "24px" }}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 style={{ margin: 0, fontSize: "1rem" }} className="font-semibold text-foreground">Item Retur</h3>
        <Button type="button" onPress={addItem} variant="secondary" size="sm" className="inline-flex items-center gap-1.5 min-h-9 px-3">
          <Plus className="size-3.5" aria-hidden="true" />
          <span>Tambah Item</span>
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full border-collapse" style={{ fontSize: "0.8125rem" }}>
        <thead>
          <tr className="border-b border-border/80 text-muted-foreground">
            <th className="p-2 text-left">Item</th>
            <th className="p-2 text-right" style={{ width: "110px" }}>Kuantitas</th>
            {extraHeaders}
            <th className="p-2" style={{ width: "48px" }}></th>
          </tr>
        </thead>
        <tbody>
          {returnItems.map((ri, index) => (
            <tr key={ri.uid} className="border-b border-border/50">
              <td className="p-2">
                <Combobox
                  options={items.map((item) => ({ value: String(item.id), label: `${item.sku} - ${item.name}` }))}
                  value={ri.itemId ? String(ri.itemId) : null}
                  onChange={(key) => updateItem(index, "itemId", key ? Number(key) : 0)}
                  placeholder="Cari item..."
                  className="w-full"
                />
              </td>
              <td className="p-2">
                <Input
                  type="number"
                  min={1}
                  aria-label={`Jumlah baris ${index + 1}`}
                  value={ri.qty}
                  onChange={(e) => updateItem(index, "qty", Math.max(1, Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 1))}
                  className="h-9 text-xs text-right font-mono tabular-nums"
                />
              </td>
              {renderExtraCells?.(ri, index)}
              <td className="p-2 text-center">
                {returnItems.length > 1 && (
                  <Button type="button" onPress={() => removeItem(index)} aria-label={`Hapus baris ${index + 1}`} variant="danger-soft" size="sm" className="min-h-9 px-2">
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}

export function ReturnFormActions({
  isPending,
  isEdit,
  submitId,
  onCancel,
}: {
  isPending: boolean
  isEdit: boolean
  submitId: string
  onCancel: () => void
}) {
  return (
    <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
      <Button type="button" onPress={onCancel} >Batal</Button>
      <Button type="submit" isDisabled={isPending}  id={submitId}>
        {isPending ? "Menyimpan..." : isEdit ? "Perbarui" : "Simpan"}
      </Button>
    </div>
  )
}

export function ReturnDateAndReason({
  date,
  setDate,
  reasonPlaceholder,
  reasonDefault,
}: {
  date: string
  setDate: (value: string) => void
  reasonPlaceholder: string
  reasonDefault: string
}) {
  return (
    <>
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
        <Textarea id="reason" name="reason" rows={3} placeholder={reasonPlaceholder} defaultValue={reasonDefault} />
      </div>
    </>
  )
}

/**
 * Field opsional nota retur pajak (F-004 §3): nomor dicatat apa adanya dari
 * nota Coretax/DJP (sistem tidak menerbitkan nomor); tanggal nota menentukan
 * masa pengurang SPT (fallback tanggal retur di backend). Keduanya kosong =
 * dikirim kosong dan server menyimpan null — perilaku lama tidak berubah.
 * Nomor lewat FormData langsung dari `name`; tanggal lewat state form induk
 * supaya nilai tersimpan tampil lagi di mode ubah.
 */
export function ReturnTaxNoteFields({
  taxReturnNoteNumberDefault,
  taxReturnNoteDate,
  setTaxReturnNoteDate,
}: {
  taxReturnNoteNumberDefault: string
  taxReturnNoteDate: string
  setTaxReturnNoteDate: (value: string) => void
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="taxReturnNoteNumber">Nomor Nota Retur Pajak (Opsional)</Label>
        <Input
          id="taxReturnNoteNumber"
          name="taxReturnNoteNumber"
          type="text"
          maxLength={100}
          defaultValue={taxReturnNoteNumberDefault}
          placeholder="Nomor dari nota Coretax/DJP"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <AppDatePicker
          label="Tanggal Nota Retur Pajak (Opsional)"
          name="taxReturnNoteDate"
          value={taxReturnNoteDate}
          onChange={(val) => setTaxReturnNoteDate(val)}
        />
      </div>
    </>
  )
}
