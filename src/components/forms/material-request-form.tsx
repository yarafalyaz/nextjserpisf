"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition, useMemo } from "react"
import { createMaterialRequest, updateMaterialRequest } from "@/actions/material-request.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Plus, Trash2 } from "lucide-react"
import { Label } from "@/components/ui/shadcn/label"
import { WarehouseSelectField } from "./warehouse-select-field"
import { Input } from "@/components/ui/shadcn/input"
import { Combobox } from "@/components/ui/combobox"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { Button } from "@/components/ui/button"
import { nextItemUid } from "@/lib/utils/item-uid"

interface MaterialRequestFormProps {
  warehouses: { id: number; name: string }[]
  items: { id: number; sku: string; name: string; unitOfMeasure: string }[]
  workOrders: { id: number; documentNo: string }[]
  request?: {
    id: number
    requesterWarehouseId: number
    sourceWarehouseId: number
    workOrderId: number | null
    neededBy: string | null
    items: Array<{ itemId: number; qty: number; notes?: string | null }>
  }
}

interface RequestItem {
  itemId: number
  qty: number
  notes: string
  /** Kunci baris untuk React; dibuang sebelum dikirim ke server. */
  uid: string
}

export function MaterialRequestForm({ warehouses, items, workOrders, request }: MaterialRequestFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [warehouseOptions, setWarehouseOptions] = useState(warehouses)
  const [requesterId, setRequesterId] = useState(request?.requesterWarehouseId ? String(request.requesterWarehouseId) : "")
  const [sourceId, setSourceId] = useState(request?.sourceWarehouseId ? String(request.sourceWarehouseId) : "")
  const [workOrderId, setWorkOrderId] = useState(request?.workOrderId ? String(request.workOrderId) : "")
  const [neededBy, setNeededBy] = useState(request?.neededBy ?? "")
  const [requestItems, setRequestItems] = useState<RequestItem[]>(
    request?.items && request.items.length > 0
      ? request.items.map((it) => ({ itemId: it.itemId, qty: it.qty, notes: it.notes ?? "", uid: nextItemUid() }))
      : [{ itemId: 0, qty: 1, notes: "", uid: nextItemUid() }],
  )

  const itemOptions = useMemo(
    () => items.map((it) => ({ value: String(it.id), label: `${it.sku} - ${it.name}` })),
    [items],
  )
  const workOrderOptions = useMemo(
    () => workOrders.map((wo) => ({ value: String(wo.id), label: wo.documentNo })),
    [workOrders],
  )

  function addItem() { setRequestItems([...requestItems, { itemId: 0, qty: 1, notes: "", uid: nextItemUid() }]) }
  function removeItem(i: number) { setRequestItems(requestItems.filter((_, idx) => idx !== i)) }
  function updateItem(i: number, field: keyof RequestItem, value: string | number) {
    const updated = [...requestItems]; updated[i] = { ...updated[i], [field]: value }; setRequestItems(updated)
  }

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.append("requesterWarehouseId", requesterId)
        formData.append("sourceWarehouseId", sourceId)
        if (workOrderId) formData.append("workOrderId", workOrderId)
        if (neededBy) formData.append("neededBy", neededBy)
        formData.append(
          "items",
          JSON.stringify(
            requestItems
              .filter((it) => it.itemId > 0 && it.qty > 0)
              .map(({ uid: _uid, notes, ...rest }) => ({ ...rest, notes: notes || undefined })),
          ),
        )
        const result = request?.id
          ? await updateMaterialRequest(request.id, formData)
          : await createMaterialRequest(formData)
        if (result && !result.success) { showError("error" in result ? result.error || "Gagal menyimpan data" : "Gagal menyimpan data"); return }
        showSuccess(request?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/inventaris/permintaan-gudang")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} aria-busy={isPending} aria-label={request?.id ? "Formulir ubah permintaan antar gudang" : "Formulir tambah permintaan antar gudang"} className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <WarehouseSelectField id="requesterWarehouseId" label="Gudang Tujuan" placeholder="Cari gudang tujuan..." value={requesterId} options={warehouseOptions} onCreatedWarehouse={(w) => setWarehouseOptions((prev) => [...prev, w])} onChange={setRequesterId} />
        <WarehouseSelectField id="sourceWarehouseId" label="Gudang Sumber" placeholder="Cari gudang sumber..." value={sourceId} options={warehouseOptions.filter((w) => String(w.id) !== requesterId)} onCreatedWarehouse={(w) => setWarehouseOptions((prev) => [...prev, w])} onChange={setSourceId} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workOrderId">Perintah Kerja</Label>
          <Combobox
            id="workOrderId"
            value={workOrderId || null}
            onChange={(key) => setWorkOrderId(key ? String(key) : "")}
            placeholder="Cari perintah kerja (opsional)..."
            options={workOrderOptions}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="neededBy">Tanggal Dibutuhkan</Label>
          <Input
            id="neededBy"
            type="date"
            value={neededBy}
            onChange={(e) => setNeededBy(e.target.value)}
          />
        </div>
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
              <DetailTableTh className="w-56">Catatan</DetailTableTh>
              <DetailTableTh className="w-16">Aksi</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {requestItems.map((item, i) => (
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
                  </DetailTableTd>
                  <DetailTableTd>
                    <Input
                      aria-label={`Catatan baris ${i + 1}`}
                      value={item.notes}
                      onChange={(e) => updateItem(i, "notes", e.target.value)}
                      placeholder="Catatan (opsional)"
                      className="w-full"
                    />
                  </DetailTableTd>
                  <DetailTableTd>
                    <Button type="button" onPress={() => removeItem(i)} variant="danger-soft" size="sm" aria-label="Hapus barang" isDisabled={requestItems.length === 1}>
                      <Trash2 size={14} />
                    </Button>
                  </DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" className="w-full sm:w-auto" onPress={() => router.back()}>Batal</Button>
        <Button type="submit" className="w-full sm:w-auto" isDisabled={isPending}>{isPending ? "Memproses..." : "Simpan"}</Button>
      </div>
    </form>
  )
}
