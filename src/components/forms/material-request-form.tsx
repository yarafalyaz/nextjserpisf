"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition, useMemo } from "react"
import { createMaterialRequest, updateMaterialRequest } from "@/actions/material-request.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Plus, Trash2 } from "@/components/ui/fontawesome-icons"
import { Label } from "@/components/ui/shadcn/label"
import { WarehouseSelectField } from "./warehouse-select-field"
import { Input } from "@/components/ui/shadcn/input"
import { Combobox } from "@/components/ui/combobox"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { Button } from "@/components/ui/button"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { AppDatePicker } from "@/components/ui/date-picker"
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
  // Idempotency: key stabil per intent tambah; retry jaringan memakai key
  // yang sama (ditolak server), sukses merotasi untuk permintaan berikutnya.
  const idempotencyKeyRef = useRef<string | null>(null)
  if (idempotencyKeyRef.current === null) idempotencyKeyRef.current = crypto.randomUUID()
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

  const itemMap = useMemo(() => new Map(items.map((it) => [it.id, it])), [items])

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
        if (!request?.id) formData.set("idempotencyKey", idempotencyKeyRef.current!)
        const result = request?.id
          ? await updateMaterialRequest(request.id, formData)
          : await createMaterialRequest(formData)
        if (result && !result.success) { showError("error" in result ? result.error || "Gagal menyimpan data" : "Gagal menyimpan data"); return }
        idempotencyKeyRef.current = crypto.randomUUID()
        showSuccess(request?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/inventaris/permintaan-gudang")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-busy={isPending}
      aria-label={
        request?.id
          ? "Formulir ubah permintaan antar gudang"
          : "Formulir tambah permintaan antar gudang"
      }
    >
      <FormCard>
        <FormSection
          title="Informasi Alur Gudang"
          description="Tentukan gudang peminta (tujuan) dan gudang penyedia stok (sumber)."
          columns={2}
        >
          <WarehouseSelectField
            id="requesterWarehouseId"
            label="Gudang Tujuan"
            placeholder="Cari gudang tujuan..."
            value={requesterId}
            options={warehouseOptions}
            onCreatedWarehouse={(w) => setWarehouseOptions((prev) => [...prev, w])}
            onChange={setRequesterId}
          />
          <WarehouseSelectField
            id="sourceWarehouseId"
            label="Gudang Sumber"
            placeholder="Cari gudang sumber..."
            value={sourceId}
            options={warehouseOptions.filter((w) => String(w.id) !== requesterId)}
            onCreatedWarehouse={(w) => setWarehouseOptions((prev) => [...prev, w])}
            onChange={setSourceId}
          />
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
          <AppDatePicker
            label="Tanggal Dibutuhkan"
            name="neededBy"
            value={neededBy}
            onChange={(val) => setNeededBy(val)}
            placeholder="Pilih batas tanggal..."
          />
        </FormSection>

        <div className="space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div>
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                Daftar Barang Diminta
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Masukkan material dan estimasi kuantitas yang dibutuhkan.
              </p>
            </div>
            <Button
              type="button"
              onPress={addItem}
              variant="secondary"
              size="sm"
              aria-label="Tambah barang"
              className="gap-1.5 h-8 text-xs"
            >
              <Plus className="size-3.5" />
              <span>Tambah Baris</span>
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh className="w-12 text-center">No</DetailTableTh>
                <DetailTableTh className="min-w-[280px]">Barang / Material</DetailTableTh>
                <DetailTableTh className="w-24 text-center">Satuan</DetailTableTh>
                <DetailTableTh className="w-36 text-right">Kuantitas</DetailTableTh>
                <DetailTableTh className="min-w-[220px]">Catatan Baris</DetailTableTh>
                <DetailTableTh className="w-16 text-center">Aksi</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {requestItems.map((item, i) => {
                  const selectedItem = item.itemId ? itemMap.get(item.itemId) : undefined
                  return (
                    <DetailTableRow key={item.uid}>
                      <DetailTableTd className="text-center font-mono text-xs text-muted-foreground">
                        {i + 1}
                      </DetailTableTd>
                      <DetailTableTd>
                        <Combobox
                          value={item.itemId ? String(item.itemId) : null}
                          onChange={(key) => updateItem(i, "itemId", key ? Number(key) : 0)}
                          placeholder="Pilih atau cari material..."
                          options={itemOptions}
                        />
                      </DetailTableTd>
                      <DetailTableTd className="text-center">
                        <span className="inline-block px-2 py-1 rounded bg-muted/60 text-xs font-mono text-muted-foreground border border-border">
                          {selectedItem?.unitOfMeasure ?? "-"}
                        </span>
                      </DetailTableTd>
                      <DetailTableTd>
                        <Input
                          type="number"
                          min="1"
                          aria-label={`Jumlah baris ${i + 1}`}
                          value={item.qty}
                          onChange={(e) => updateItem(i, "qty", Number(e.target.value))}
                          placeholder="0"
                          className="w-full text-right font-mono tabular-nums h-9 text-xs"
                        />
                      </DetailTableTd>
                      <DetailTableTd>
                        <Input
                          aria-label={`Catatan baris ${i + 1}`}
                          value={item.notes}
                          onChange={(e) => updateItem(i, "notes", e.target.value)}
                          placeholder="Catatan spesifik item (opsional)"
                          className="w-full h-9 text-xs"
                        />
                      </DetailTableTd>
                      <DetailTableTd>
                        <div className="flex justify-center">
                          <Button
                            type="button"
                            onPress={() => removeItem(i)}
                            variant="danger-soft"
                            size="sm"
                            aria-label={`Hapus barang baris ${i + 1}`}
                            isDisabled={requestItems.length === 1}
                            className="h-8 w-8 p-0"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </DetailTableTd>
                    </DetailTableRow>
                  )
                })}
              </DetailTableBody>
            </DetailTable>
          </div>
        </div>

        <FormActions>
          <Button
            type="button"
            variant="outline"
            onPress={() => router.back()}
            className="w-full sm:w-auto h-9 text-xs"
          >
            Batal
          </Button>
          <Button
            type="submit"
            isDisabled={isPending}
            className="w-full sm:w-auto h-9 text-xs"
          >
            {isPending ? "Menyimpan..." : request?.id ? "Perbarui Permintaan" : "Simpan Permintaan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
