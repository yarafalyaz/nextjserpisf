"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition, useMemo } from "react"
import { createInventoryTransfer, updateInventoryTransfer } from "@/actions/inventory.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Plus, Trash2 } from "lucide-react"
import { Label } from "@/components/ui/shadcn/label"
import { WarehouseSelectField } from "./warehouse-select-field"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { Button } from "@/components/ui/button"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { nextItemUid } from "@/lib/utils/item-uid"

interface TransferFormProps {
  warehouses: { id: number; name: string }[]
  transfer?: { id: number; sourceWarehouseId: number; destinationWarehouseId: number; date: string; notes?: string | null; items?: Array<{ itemId: number; qty: number }> }
  items: { id: number; sku: string; name: string; qtyOnHand: string }[]
}

interface TransferItem {
  itemId: number
  qty: number
  /** Kunci baris untuk React; dibuang sebelum dikirim ke server. */
  uid: string;
}

export function InventoryTransferForm({ warehouses, items, transfer }: TransferFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [warehouseOptions, setWarehouseOptions] = useState(warehouses)
  const [sourceId, setSourceId] = useState(transfer?.sourceWarehouseId ? String(transfer.sourceWarehouseId) : "")
  const [destId, setDestId] = useState(transfer?.destinationWarehouseId ? String(transfer.destinationWarehouseId) : "")
  const [notes, setNotes] = useState(transfer?.notes ?? "")
  const [transferItems, setTransferItems] = useState<TransferItem[]>(
    transfer?.items && transfer.items.length > 0
      ? transfer.items.map((it) => ({ itemId: it.itemId, qty: it.qty, uid: nextItemUid() }))
      : [{ itemId: 0, qty: 1, uid: nextItemUid() }]
  )

  const itemOptions = useMemo(
    () => items.map((it) => ({ value: String(it.id), label: `${it.sku} - ${it.name}` })),
    [items]
  )
  const stockById = useMemo(() => {
    const map = new Map<number, number>()
    items.forEach((it) => map.set(it.id, Number(it.qtyOnHand)))
    return map
  }, [items])

  function addItem() { setTransferItems([...transferItems, { itemId: 0, qty: 1, uid: nextItemUid() }]) }
  function removeItem(i: number) { setTransferItems(transferItems.filter((_, idx) => idx !== i)) }
  function updateItem(i: number, field: keyof TransferItem, value: string | number) {
    const updated = [...transferItems]; updated[i] = { ...updated[i], [field]: value }; setTransferItems(updated)
  }

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.append("sourceWarehouseId", sourceId)
        formData.append("destinationWarehouseId", destId)
        formData.append("date", transfer?.date ?? toLocalDateOnly(new Date()))
        if (notes) formData.append("notes", notes)
        formData.append("items", JSON.stringify(transferItems.filter((it) => it.itemId > 0 && it.qty > 0).map(({ uid: _uid, ...rest }) => rest)))
        const result = transfer?.id ? await updateInventoryTransfer(transfer.id, formData) : await createInventoryTransfer(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        showSuccess(transfer?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/inventaris/transfer")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} aria-busy={isPending} aria-label={transfer?.id ? "Formulir ubah transfer stok" : "Formulir tambah transfer stok"} className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <WarehouseSelectField id="sourceWarehouseId" label="Dari Gudang" placeholder="Cari gudang asal..." value={sourceId} options={warehouseOptions} onCreatedWarehouse={(w) => setWarehouseOptions((prev) => [...prev, w])} onChange={setSourceId} />
        <WarehouseSelectField id="destinationWarehouseId" label="Ke Gudang" placeholder="Cari gudang tujuan..." value={destId} options={warehouseOptions.filter((w) => String(w.id) !== sourceId)} onCreatedWarehouse={(w) => setWarehouseOptions((prev) => [...prev, w])} onChange={setDestId} />
      </div>

      <div className="form-section">
        <div className="form-section-header">
          <h3 className="form-section-title">Barang</h3>
          <Button type="button" onPress={addItem} variant="secondary" size="sm" aria-label="Tambah barang">
            <Plus size={14} /> Tambah
          </Button>
        </div>

        <div className="overflow-x-auto">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh className="w-full">Barang</DetailTableTh>
              <DetailTableTh className="w-36">Jml</DetailTableTh>
              <DetailTableTh className="w-16">Aksi</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {transferItems.map((item, i) => {
                const stock = item.itemId ? stockById.get(item.itemId) : undefined
                return (
                  <DetailTableRow key={item.uid}>
                    <DetailTableTd>
                      <Combobox
                        value={item.itemId ? String(item.itemId) : null}
                        onChange={(key) => updateItem(i, "itemId", key ? Number(key) : 0)}
                        placeholder="Cari barang..."
                        options={itemOptions}
                      />
                    </DetailTableTd>
                    <DetailTableTd>
                      <Input
                        type="number"
                        min="1"
                        aria-label={`Jumlah baris ${i + 1}`}
                        value={item.qty}
                        onChange={(e) => updateItem(i, "qty", Number(e.target.value))}
                        placeholder="Jml"
                        className="w-full"
                      />
                      {stock !== undefined && (
                        <span className="mt-1 block text-xs text-muted-foreground whitespace-nowrap">
                          stok: {stock}
                        </span>
                      )}
                    </DetailTableTd>
                    <DetailTableTd>
                      <Button type="button" onPress={() => removeItem(i)} variant="danger-soft" size="sm" aria-label={`Hapus barang baris ${i + 1}`} isDisabled={transferItems.length === 1}>
                        <Trash2 size={14} />
                      </Button>
                    </DetailTableTd>
                  </DetailTableRow>
                )
              })}
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>

      <div className="form-section">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">Catatan</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Catatan transfer..."
          />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" className="w-full sm:w-auto" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" className="w-full sm:w-auto" isDisabled={isPending} >{isPending ? "Memproses..." : "Buat Transfer"}</Button>
      </div>
    </form>
  )
}
